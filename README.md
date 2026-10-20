# Cosmic Week Tracker and Mood Guide

A rebuild of the [PartyRock app](https://partyrock.aws/u/diaraylouden/d7rzs7WNA/Cosmic-Week-Tracker-and-Mood-Guide) of the same name, with the same widgets and look, but with the facts computed in code instead of by the model.

| Widget | Original (PartyRock) | Here |
|---|---|---|
| Moon Phase Today | LLM asked to do Julian Date math for a hardcoded May 12, 2026 | Julian Date math in code for the real current moment, checked against the astronomy-engine lunar ephemeris |
| Personal Day Number | LLM arithmetic for May 12, 2026 | Personal Year → Month → Day computed in code, master numbers 11 and 22 kept |
| Planetary Transits Today | LLM with hardcoded (incorrect) Mercury retrograde dates | Ephemeris positions, retrograde stations and shadow periods, aspects, ingresses, eclipses, transits to your natal Sun, and a transparent intensity score |
| Your Cosmic Week | — | Mon–Sun strip of moon phase, Personal Day, and your logged moods |
| Cosmic Mood Correlation | LLM re-derived everything from scratch | LLM interprets the computed values plus your mood log, so "patterns" are real |

The model (via OpenRouter) only writes the interpretations, and is told never to recompute or contradict the data.

## Run it

```sh
npm install
cp .env.example .env   # add your OPENROUTER_API_KEY
npm start              # http://localhost:3000
```

Without a key, every computed value still shows; only the AI interpretation paragraphs are disabled.

`npm test` runs the calculation tests.

## How "today" works

The browser sends its IANA timezone. The server resolves today's date in that zone at request time and uses the current moment for the Moon. The page re-fetches automatically if left open past midnight.
