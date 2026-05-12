FROM eclipse-temurin:21-jre

WORKDIR /app

ENV KIDS_QUIZ_DATA_DIR=/data
ENV KIDS_QUIZ_DB_PATH=/data/kids-quiz.sqlite
ENV KIDS_QUIZ_STATIC_DIR=/app/public

COPY app.jar ./app.jar
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/kids-quiz-entrypoint

RUN mkdir -p /data \
    && chmod +x /usr/local/bin/kids-quiz-entrypoint

EXPOSE 8080

ENTRYPOINT ["kids-quiz-entrypoint"]
