#!/usr/bin/env python3
"""
Compute true LM perplexity for each explanation item using GPT-2.

Requirements:
  pip install torch transformers

Usage:
  python3 scripts/score-perplexity-gpt2.py \
    --in data/explanations.json --out data/explanations.json \
    [--force]

Notes:
  - Perplexity is computed on the SOURCE SPEECH text (not the note), using
    byte offsets (startOffset/endOffset) into romeo-and-juliet.txt.
  - Writes fields: "perplexity" (float), "perplexityModel": "gpt2".
"""

import argparse
import json
import math
import os

from transformers import GPT2LMHeadModel, GPT2TokenizerFast  # type: ignore
import torch  # type: ignore


def read_bytes(path: str) -> bytes:
    with open(path, 'rb') as f:
        return f.read()


def slice_utf8_bytes(buf: bytes, start: int, end: int) -> str:
    start = max(0, int(start))
    end = max(start, int(end))
    return buf[start:end].decode('utf-8', errors='ignore')


def perplexity(model, tokenizer, text: str) -> float:
    if not text.strip():
        return 0.0
    enc = tokenizer(text, return_tensors='pt')
    with torch.no_grad():
        out = model(**enc, labels=enc['input_ids'])
        loss = out.loss
    try:
        ppl = math.exp(loss.item())
    except Exception:
        ppl = float('inf')
    # map to 0..100-ish for UI if desired; here we keep raw PPL
    return float(ppl)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', default='data/explanations.json')
    ap.add_argument('--out', dest='out', default=None)
    ap.add_argument('--force', action='store_true', help='re-score items that already have perplexity')
    ap.add_argument('--model', default='gpt2', help='HF model id (default: gpt2)')
    args = ap.parse_args()

    out_path = args.out or args.inp

    with open(args.inp, 'r', encoding='utf-8') as f:
        items = json.load(f)
    if not isinstance(items, list):
        print('Input JSON must be an array of explanation objects.')
        return

    play_bytes = read_bytes('romeo-and-juliet.txt')

    print('Loading model:', args.model)
    tok = GPT2TokenizerFast.from_pretrained(args.model)
    mdl = GPT2LMHeadModel.from_pretrained(args.model)
    mdl.eval()

    done = 0
    for i, it in enumerate(items):
        if (not args.force) and isinstance(it.get('perplexity'), (int, float)):
            continue
        s = int(it.get('startOffset', 0))
        e = int(it.get('endOffset', s + 1))
        text = slice_utf8_bytes(play_bytes, s, e)
        try:
            ppl = perplexity(mdl, tok, text)
        except Exception as ex:
            print('Failed at index', i, ex)
            ppl = 0.0
        it['perplexity'] = round(float(ppl), 2)
        it['perplexityModel'] = args.model
        done += 1
        if done % 10 == 0:
            print(f'.. scored {done}/{len(items)}')

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print(f'Wrote {len(items)} items -> {out_path}')


if __name__ == '__main__':
    main()

