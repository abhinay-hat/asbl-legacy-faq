# ASBL Legacy — Sales FAQ Portal

Internal sales tool for ASBL Legacy at RTC Cross Road, Hyderabad.

## Setup

```bash
cd legacy-faq
npm install
```

Add your OpenRouter API key to `.env`:
```
OPENROUTER_API_KEY=your_actual_key_here
PORT=3000
```

Get a free key at https://openrouter.ai

## Run

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Open http://localhost:3000

## Features

- **Instant search** — keyword match across 50 Q&A pairs from the project FAQ
- **Category filter** — Project Level, Unit Level, Clubhouse, Urban Corridor, Landscape, Specifications
- **AI fallback** — OpenRouter (Gemma 3 27B) answers questions not in the FAQ with 2-pass confidence verification
- **Raise to Backend** — unanswered questions saved to `data/questions.json` with name, priority, and timestamp
- **Admin view** — see all raised questions sorted by date

## File Structure

```
legacy-faq/
  server.js          Express backend
  public/
    index.html       UI
    style.css        Legacy-branded styles (Cinzel + Josefin Sans)
    app.js           Frontend logic
  data/
    faqs.json        50 Q&A pairs parsed from PDF
    questions.json   Raised questions (starts empty)
  .env               API keys
  package.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/faqs | All 50 FAQ pairs |
| POST | /api/search | Search FAQs + AI fallback |
| POST | /api/questions | Save a raised question |
| GET | /api/questions | Admin: all raised questions |

## PDF Re-parsing

On startup, the server checks if `data/faqs.json` is populated. If empty, it attempts to parse the PDF at `~/Downloads/260406-Legacy- Sales FAQ.pdf` using `pdf-parse`. The parsed data is cached to `data/faqs.json`.
