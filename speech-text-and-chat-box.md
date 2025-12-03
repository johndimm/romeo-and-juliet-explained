
The Speech Text on the left is the original Shakespeare.  It is a block of dialog spoken by one person.  There may be stage directions in the middle.

The Chat Box on the right of each block of Speech Text has three states:

  - invisible
  - note only
  - note, explanations, answers, text input

Chat Box contains three kinds of entries

  - note: a note generated using the DeepSeek API at build time
  - explanations: of text selected from Speech Text
  - answers: to follow-up questions

Notes are static and quick to retrieve. They were generated from an entire scene of the play in one off-line prompt.

Chat Box also contains longer responses to the same input:

  - More about the note
  - More about explanation for "to be ..."
  - More about follow-up answer for "why is Romeo so..."

And at the bottom

  - a text input box to write your own follow-up question

Entries are created by

  - selected text
    - select text from Speech Text
    - click to select the containing sentence
    - click-drag for a phrase or long passage
    - title is "Selected Text: " followed by selected text

  - more
    - click on note, explanation, or answer 
    - for prompt context, include the existing item text to avoid repetition
    - title is just More
    - insert the long answer after the source  
    - there may be more than one More

Entries can be deleted by clicking on the garbage can.  You can close the whole thing with the X top left.  

The Chat Box should act like a standard AI interface.  Entries are added at the bottom and move up as new entries are added after them.  Except the More blocks, which are inserted into the flow.

A user may want to generate several responses from different models for comparison.

The note is always there whenever the Chat Box is visible.  
