#!/bin/bash

# Battleplanes Quick Start Script

set -e

echo "Battleplanes - Quick Start"
echo "=========================="
echo ""

# Check prerequisites
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "Checking prerequisites..."

if ! command_exists docker; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

echo "Docker is installed"
echo ""

# Menu
echo "Choose deployment option:"
echo "1) Docker Compose (Local Development)"
echo "2) Kubernetes (Minikube)"
echo "3) Kubernetes (kind)"
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "Starting with Docker Compose..."
        echo ""

        docker compose up --build -d

        echo ""
        echo "Application started!"
        echo ""
        echo "  Frontend:  http://localhost"
        echo "  Backend:   http://localhost:8000"
        echo "  API Docs:  http://localhost:8000/docs"
        echo ""
        echo "  View logs: docker compose logs -f"
        echo "  Stop:      docker compose down"
        ;;

    2)
        if ! command_exists minikube; then
            echo "Error: Minikube is not installed."
            exit 1
        fi

        if ! command_exists kubectl; then
            echo "Error: kubectl is not installed."
            exit 1
        fi

        echo ""
        echo "Starting with Minikube..."
        echo ""

        if ! minikube status >/dev/null 2>&1; then
            echo "Starting Minikube..."
            minikube start
        fi

        echo "Building Docker images..."
        docker build -t battleplanes-backend:latest ./backend
        docker build -t battleplanes-frontend:latest ./frontend

        echo "Loading images into Minikube..."
        minikube image load battleplanes-backend:latest
        minikube image load battleplanes-frontend:latest

        echo "Deploying to Kubernetes..."
        kubectl apply -f k8s/namespace.yaml
        kubectl apply -f k8s/config.yaml
        kubectl apply -f k8s/redis.yaml
        kubectl apply -f k8s/backend-deployment.yaml
        kubectl apply -f k8s/frontend-deployment.yaml
        kubectl apply -f k8s/cert-issuer.yaml
        kubectl apply -f k8s/ingress.yaml

        echo ""
        echo "Waiting for pods to be ready..."
        kubectl wait --for=condition=ready pod -l app=battleplanes --timeout=120s

        echo ""
        echo "Application deployed!"
        echo ""
        echo "Getting service URL..."
        minikube service frontend --url
        echo ""
        echo "  Open in browser:  minikube service frontend"
        echo "  Check status:     kubectl get pods"
        echo "  Delete:           kubectl delete -f k8s/"
        ;;

    3)
        if ! command_exists kind; then
            echo "Error: kind is not installed."
            exit 1
        fi

        if ! command_exists kubectl; then
            echo "Error: kubectl is not installed."
            exit 1
        fi

        echo ""
        echo "Starting with kind..."
        echo ""

        if ! kind get clusters | grep -q "battleplanes"; then
            echo "Creating kind cluster..."
            kind create cluster --name battleplanes
        fi

        echo "Building Docker images..."
        docker build -t battleplanes-backend:latest ./backend
        docker build -t battleplanes-frontend:latest ./frontend

        echo "Loading images into kind..."
        kind load docker-image battleplanes-backend:latest --name battleplanes
        kind load docker-image battleplanes-frontend:latest --name battleplanes

        echo "Deploying to Kubernetes..."
        kubectl apply -f k8s/namespace.yaml
        kubectl apply -f k8s/config.yaml
        kubectl apply -f k8s/redis.yaml
        kubectl apply -f k8s/backend-deployment.yaml
        kubectl apply -f k8s/frontend-deployment.yaml
        kubectl apply -f k8s/cert-issuer.yaml
        kubectl apply -f k8s/ingress.yaml

        echo ""
        echo "Waiting for pods to be ready..."
        kubectl wait --for=condition=ready pod -l app=battleplanes --timeout=120s

        echo ""
        echo "Application deployed!"
        echo ""
        echo "Run in a new terminal:"
        echo "  kubectl port-forward service/frontend 8080:80"
        echo ""
        echo "Then access at: http://localhost:8080"
        echo ""
        echo "  Check status:     kubectl get pods"
        echo "  Delete cluster:   kind delete cluster --name battleplanes"
        ;;

    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "Enjoy the game!"
