# Product Overview

## Purpose

Kids Quiz helps children practice question-and-answer material in a playful, time-boxed format. The app emphasizes fast recall, simple scoring, and adaptive repetition of questions that are difficult across multiple test sessions.

## Target Users

- Children practicing simple facts, school topics, or language vocabulary.
- Parents or teachers who maintain question sets in the SQLite database.
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
- Rich authoring tools for question banks.
- Strict grading of typed free-form answers.
- Full analytics dashboard.

## Success Criteria

- A user can choose a test from the start screen and immediately play.
- Settings and the server-owned SQLite question set survive browser refresh.
- Wrong and timed-out answers are recorded on the server and affect future question selection.
- The app works locally through the Angular + Kotlin/Ktor Docker image.
- The UI remains readable on desktop and mobile viewports.
