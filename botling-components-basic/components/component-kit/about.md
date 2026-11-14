component-kit: a set of basic components with a shared look (multiple-choice buttons, an optional "Other" input, data cards), so other components and bots can reuse the same styles and interactions.

## Data format (window.ccb.data; window.deck.data is still read as a fallback)

All fields are optional. Sections without data are not shown (with no data at all the card is empty).

```json
{
  "title": "What should we do next?",
  "question": "Which direction do you want to handle first?",
  "options": [
    { "label": "Plan A", "description": "Ship first, optimize later" },
    { "label": "Plan B", "description": "Add tests first, lower risk" }
  ],
  "allowOther": true,
  "otherPlaceholder": "Other (type your own)",
  "chosen": null,
  "answer": null,
  "cards": [
    { "label": "Estimated effort", "value": "3 days", "note": "Including tests" },
    { "label": "Recommended plan", "value": "Plan B", "note": "Lower risk", "tone": "suggest" }
  ]
}
```

- `options`: the choices. `label` is the main button text, `description` is optional.
- `allowOther`: whether to show the "Other" input (hidden by default; only `true` turns it on). The "Your answer: ..." line also appears only when `allowOther` is `true`.
- `chosen`: index of the selected option (starting at 0); `null` means nothing selected yet.
- `answer`: the user's own typed answer; `null` means none. If either `chosen` or `answer` is not `null`, the component counts as answered: the buttons and input are disabled, and the selection or "Your answer: ..." is shown.
- `cards`: data cards, display only. `tone: "suggest"` adds an orange "Suggested" tag; any other value or omitting it gives a normal card.

## What the bot receives when the user answers

- Clicking an option: `ccb.answer(i)`, where `i` is the option index (a number, starting at 0). For example, clicking the second option sends `1`.
- Submitting the "Other" input (Submit button or Enter): `ccb.answer("text")`, the bot receives the string the user typed, trimmed; an empty input sends nothing.
- After submitting, the component locks and the answer cannot be changed. To change the question, regenerate the component; do not send a second answer from the same component.
- Each new data (a refresh or a re-sent identical value too) redraws the card from scratch: typed text is cleared, and answered or not is read again from `chosen` / `answer`. Nothing is sent by a new data.
- The card has no Command, saved state or status chip.
