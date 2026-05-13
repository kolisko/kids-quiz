# Product Overview

## Purpose

Kids Quiz helps children practice question-and-answer material in a playful, time-boxed format. The app emphasizes fast recall, simple scoring, and adaptive repetition of questions that are difficult across multiple test sessions.

## Target Users

- Children practicing simple facts, school topics, language vocabulary, or parent-provided questions.
- Parents or teachers who prepare question sets as JSON.
- A local single-user or family setup where the same server instance accumulates long-term difficulty statistics.

## Goals

- Show one question at a time in a fullscreen, child-friendly UI.
- Make answering simple: reveal answer, mark wrong, or continue as correct.
- Penalize missed time limits and wrong answers.
- Reward reaching a configured target score with a fun animal celebration.
- Persist settings on the client, while the active question set and difficulty stats live on the server.
- Prefer harder questions more often in later tests.

## Non-Goals

- Multi-user accounts, authentication, or per-child profiles.
- Remote cloud sync.
- Rich authoring tools for question banks beyond JSON editing.
- Strict grading of typed free-form answers.
- Full analytics dashboard.

## Success Criteria

- A user can paste a valid `[{ "q": "...", "a": "..." }]` question set and immediately play.
- Settings and the server-owned question set survive browser refresh.
- Wrong and timed-out answers are recorded on the server and affect future question selection.
- The app works locally through the Angular + Kotlin/Ktor Docker image.
- The UI remains readable on desktop and mobile viewports.
