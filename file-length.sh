#!/bin/bash

function measure() {
  echo `wc -l $1`
}

export -f measure
find $1 -type f -exec bash -c 'measure "$@"' _ {} \;

