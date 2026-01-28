#!/bin/bash

# Battleships Quick Start Script
# This script helps you quickly deploy the application

set -e

echo "🚢 Battleships Game - Quick Start"
echo "=================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "Checking prerequisites..."

if ! command_exists docker; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command_exists docker-compose; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
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
        echo "🐳 Starting with Docker Compose..."
        echo ""
        
        docker-compose up --build -d
        
        echo ""
        echo "✅ Application started!"
        echo ""
        echo "Access the game at: http://localhost"
        echo "Backend API docs: http://localhost:8000/docs"
        echo ""
        echo "To view logs: docker-compose logs -f"
        echo "To stop: docker-compose down"
        ;;
    
    2)
        if ! command_exists minikube; then
            echo "❌ Minikube is not installed."
            exit 1
        fi
        
        if ! command_exists kubectl; then
            echo "❌ kubectl is not installed."
            exit 1
        fi
        
        echo ""
        echo "☸️  Starting with Minikube..."
        echo ""
        
        # Start minikube if not running
        if ! minikube status >/dev/null 2>&1; then
            echo "Starting Minikube..."
            minikube start
        fi
        
        echo "Building Docker images..."
        docker build -t battleships-backend:latest ./backend
        docker build -t battleships-frontend:latest ./frontend
        
        echo "Loading images into Minikube..."
        minikube image load battleships-backend:latest
        minikube image load battleships-frontend:latest
        
        echo "Deploying to Kubernetes..."
        kubectl apply -f k8s/backend-deployment.yaml
        kubectl apply -f k8s/frontend-deployment.yaml
        
        echo ""
        echo "Waiting for pods to be ready..."
        kubectl wait --for=condition=ready pod -l app=battleships --timeout=120s
        
        echo ""
        echo "✅ Application deployed!"
        echo ""
        echo "Getting service URL..."
        minikube service frontend --url
        echo ""
        echo "To open in browser: minikube service frontend"
        echo "To check status: kubectl get pods -l app=battleships"
        echo "To delete: kubectl delete -f k8s/"
        ;;
    
    3)
        if ! command_exists kind; then
            echo "❌ kind is not installed."
            exit 1
        fi
        
        if ! command_exists kubectl; then
            echo "❌ kubectl is not installed."
            exit 1
        fi
        
        echo ""
        echo "☸️  Starting with kind..."
        echo ""
        
        # Check if cluster exists
        if ! kind get clusters | grep -q "battleships"; then
            echo "Creating kind cluster..."
            kind create cluster --name battleships
        fi
        
        echo "Building Docker images..."
        docker build -t battleships-backend:latest ./backend
        docker build -t battleships-frontend:latest ./frontend
        
        echo "Loading images into kind..."
        kind load docker-image battleships-backend:latest --name battleships
        kind load docker-image battleships-frontend:latest --name battleships
        
        echo "Deploying to Kubernetes..."
        kubectl apply -f k8s/backend-deployment.yaml
        kubectl apply -f k8s/frontend-deployment.yaml
        
        echo ""
        echo "Waiting for pods to be ready..."
        kubectl wait --for=condition=ready pod -l app=battleships --timeout=120s
        
        echo ""
        echo "✅ Application deployed!"
        echo ""
        echo "Setting up port forward..."
        echo "Run the following command in a new terminal:"
        echo "kubectl port-forward service/frontend 8080:80"
        echo ""
        echo "Then access at: http://localhost:8080"
        echo "To check status: kubectl get pods -l app=battleships"
        echo "To delete cluster: kind delete cluster --name battleships"
        ;;
    
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎮 Enjoy the game!"
