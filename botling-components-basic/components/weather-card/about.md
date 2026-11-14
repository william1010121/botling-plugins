Weather card: shows one day of weather for a single city. Show it with `<show name="weather-card">JSON</show>`.

## Data format (window.deck.data)

```json
{
  "city": "Taipei",
  "date": "Tue, 10/20",
  "tempHigh": 26,
  "tempLow": 19,
  "rainChance": 60,
  "condition": "Cloudy to partly cloudy, brief showers in the afternoon",
  "tip": "Remember to bring an umbrella"
}
```

- `tempHigh`, `tempLow`: temperature in Celsius, as numbers (a ° is appended); strings are shown as-is.
- `rainChance`: chance of rain, a number from 0 to 100 (a % is appended).
- All other fields are text. Every field is optional; a missing field hides its section.
- No user answer is needed and `deck.answer` is never called. Supports light and dark themes.
- Pinned chip: shows the temperatures and rain chance (for example `26°/19° 60%`), with a warning dot when `rainChance` is 60 or more; the chip is cleared when there is no temperature or rain data. Drawn with the shared component kit, so it follows the app's light and dark themes and adapts to any Board size (small tiles keep just the city, date and temperature).

Icon: cloud.sun.fill
