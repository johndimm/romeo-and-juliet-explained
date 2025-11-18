
1.  cannot scroll to top of file.  As if the top is below the header.

2.  on first load should go to the beginning of the play, not the table of contents.

3.  on mobile, click-drag selects but does not submit.

4.  after selecting text, before the LLM response is displayed, the selected text is displayed twice in the right column.  One copy is removed when the response is ready.

5.  "show me a mistress that is passing fair..." gpt-4o-mini thinks Romeo is talking about Juliet.  But claude knows that it's Rosaline.  He has not yet met Juliet.  I need to use a different default LLM, one that does not make this mistake.

6.  Add ":" to sentence separator characters when finding the sentence from a click.

7.  Selected Text printed twice in chat box.

8.  Prompts

A prompt for selected speech text includes as context:

- the full speech
- the note
- the note for the previous speech

A prompt for More or Chat query should also include:

- the explanations created so far

That means the chat ui query by the user can refer to any of the existing explanations, but especially the one that was added most recently.

9.  The real Chat UI

Let's call the entire div on the right of a speech the Chat UI.  I was using that before for just the text input box.  Now I want to use it for the whole div.

It should have the text input box at the bottom.  I asked for it to follow the note before, I changed my mind.

New explanations should appear just above the text input box and move up as new explanations arrive.  So the note is always at the top, and the first explanation is below it.

It would be ideal for the Chat UI to be as tall as the source speech, but enforcing that size limit may be awkward.  One option:  it has a max height to avoid going too far over, and y-overflow of auto.  This may not work well because of the scroll bar.  It may be better to just let it grow.

Since items will be added in the order they were requested, there can be a gap between a note or explanation and its More block.  How do we know they are connected?  Answer:  give the More blocks titles that link back to the source.  Something like "More about Text Selection <i>to be, or not to be</i>". Show the first n characters of the quote, enough to identify it.
