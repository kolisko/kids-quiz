# KitQuiz Specification

Tato slozka obsahuje produktovou a technickou specifikaci aplikace KitQuiz.

KitQuiz je detska webova kvizova hra s Angular frontendem a Kotlin/Ktor backendem. Zobrazuje nahodne otazky ulozene v SQLite, meri cas na zobrazeni odpovedi, boduje spravne a spatne odpovedi a po dosazeni ciloveho skore ukazuje animovanou gratulaci se zviratkem.

## Dokumenty

- [01 Product Overview](01-product-overview.md)
- [02 Functional Requirements](02-functional-requirements.md)
- [03 Non-Functional Requirements](03-non-functional-requirements.md)
- [04 Use Cases](04-use-cases.md)
- [05 Architecture](05-architecture.md)
- [06 Data And API Contracts](06-data-and-api-contracts.md)
- [07 UI And Game Flow](07-ui-and-game-flow.md)
- [08 Adaptive Question Selection](08-adaptive-question-selection.md)
- [09 Testing And Acceptance](09-testing-and-acceptance.md)
- [10 Operations And Development](10-operations-and-development.md)

## Current Implementation Summary

- Frontend: Angular standalone app served as static files from the backend.
- Backend: Kotlin/Ktor HTTP API under `/api`.
- Local browser persistence: `localStorage` only for user settings.
- Server persistence: SQLite DB for active questions and long-term question performance stats.
- Static assets: 40 local SVG animal celebration images.
