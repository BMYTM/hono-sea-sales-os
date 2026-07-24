# HONO Sales OS — container for one always-on host the team browses to.
FROM python:3.12-slim

# LibreOffice for PDF preview (optional but included)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV HONO_HOST=0.0.0.0 HONO_PORT=8765 \
    HONO_SOFFICE=/usr/bin/soffice \
    HONO_PROJECT_DIR=/data/Proposal\ Generation
EXPOSE 8765
CMD ["gunicorn","-b","0.0.0.0:8765","-w","2","-t","180","app:app"]
