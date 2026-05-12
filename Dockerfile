FROM eclipse-temurin:21-jre

WORKDIR /app/site

ENV KIDS_QUIZ_DATA_DIR=/data

COPY .kobweb ./.kobweb
COPY build/dist ./build/dist

RUN mkdir -p /data \
    && chmod +x ./.kobweb/server/start.sh

EXPOSE 8080

CMD ["bash", "-lc", "rm -f ./.kobweb/server/state.yaml && exec ./.kobweb/server/start.sh"]
