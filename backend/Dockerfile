FROM python:3.11-slim

WORKDIR /app

# keep an eye on  this change
COPY . /app/
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--ws-ping-interval", "30", "--ws-ping-timeout", "10"]
