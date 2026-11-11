FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY core.py app.py schema.sql attendance.js ./
ENV PYTHONDONTWRITEBYTECODE=1
EXPOSE 3111
CMD ["python", "app.py"]
