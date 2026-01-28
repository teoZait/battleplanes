.PHONY: help build-backend build-frontend build-all up down clean deploy-k8s delete-k8s logs

help:
	@echo "Battleships Game - Available Commands"
	@echo "======================================"
	@echo "Docker Compose:"
	@echo "  make up              - Start all services"
	@echo "  make down            - Stop all services"
	@echo "  make logs            - View logs"
	@echo "  make clean           - Remove all containers and images"
	@echo ""
	@echo "Docker Build:"
	@echo "  make build-backend   - Build backend image"
	@echo "  make build-frontend  - Build frontend image"
	@echo "  make build-all       - Build all images"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make deploy-k8s      - Deploy to Kubernetes"
	@echo "  make delete-k8s      - Delete from Kubernetes"
	@echo "  make k8s-status      - Check Kubernetes status"

# Docker Compose commands
up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	docker rmi battleships-backend:latest battleships-frontend:latest 2>/dev/null || true

# Docker build commands
build-backend:
	docker build -t battleships-backend:latest ./backend

build-frontend:
	docker build -t battleships-frontend:latest ./frontend

build-all: build-backend build-frontend

# Kubernetes commands
deploy-k8s:
	kubectl apply -f k8s/backend-deployment.yaml
	kubectl apply -f k8s/frontend-deployment.yaml

delete-k8s:
	kubectl delete -f k8s/frontend-deployment.yaml
	kubectl delete -f k8s/backend-deployment.yaml

k8s-status:
	@echo "Pods:"
	@kubectl get pods -l app=battleships
	@echo ""
	@echo "Services:"
	@kubectl get services -l app=battleships
	@echo ""
	@echo "Deployments:"
	@kubectl get deployments -l app=battleships

# Development
dev-backend:
	cd backend && uvicorn main:app --reload

dev-frontend:
	cd frontend && npm run dev
