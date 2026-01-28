# Deployment Guide

This guide covers different deployment scenarios for the Battleships game.

## Table of Contents

1. [Local Development](#local-development)
2. [Docker Compose Deployment](#docker-compose-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Production Considerations](#production-considerations)

---

## Local Development

### Backend Only

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Access at: http://localhost:8000

### Frontend Only

```bash
cd frontend
npm install
npm run dev
```

Access at: http://localhost:3000

**Note**: Update `frontend/.env` with backend URL if needed.

---

## Docker Compose Deployment

### Quick Start

```bash
# Build and start
docker-compose up --build

# Or use Makefile
make build-all
make up
```

### View Logs

```bash
docker-compose logs -f

# Or
make logs
```

### Stop Services

```bash
docker-compose down

# Or
make down
```

### Complete Cleanup

```bash
docker-compose down -v
docker system prune -a

# Or
make clean
```

---

## Kubernetes Deployment

### Prerequisites

1. **Kubernetes Cluster**: Choose one of:
   - **Minikube** (local development)
   - **kind** (local development)
   - **Docker Desktop** (local development)
   - **Cloud Provider** (AWS EKS, Google GKE, Azure AKS)

2. **kubectl**: Installed and configured

### Minikube Setup

```bash
# Start minikube
minikube start

# Enable metrics (optional)
minikube addons enable metrics-server

# Build images
make build-all

# Load images into minikube
minikube image load battleships-backend:latest
minikube image load battleships-frontend:latest
```

### kind Setup

```bash
# Create cluster
kind create cluster --name battleships

# Build images
make build-all

# Load images into kind
kind load docker-image battleships-backend:latest --name battleships
kind load docker-image battleships-frontend:latest --name battleships
```

### Deploy to Kubernetes

```bash
# Deploy using Makefile
make deploy-k8s

# Or manually
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
```

### Verify Deployment

```bash
# Check status
make k8s-status

# Or manually
kubectl get pods -l app=battleships
kubectl get services -l app=battleships
kubectl get deployments -l app=battleships

# Watch pods
kubectl get pods -w
```

### Access the Application

#### Minikube

```bash
# Get URL
minikube service frontend --url

# Or open in browser
minikube service frontend
```

#### kind

```bash
# Port forward
kubectl port-forward service/frontend 8080:80

# Access at http://localhost:8080
```

#### Cloud Provider

```bash
# Get external IP
kubectl get service frontend

# Wait for EXTERNAL-IP (may take a few minutes)
# Access at http://<EXTERNAL-IP>
```

### Scaling

```bash
# Scale backend
kubectl scale deployment battleships-backend --replicas=3

# Scale frontend
kubectl scale deployment battleships-frontend --replicas=3
```

### View Logs

```bash
# Backend logs
kubectl logs -f deployment/battleships-backend

# Frontend logs
kubectl logs -f deployment/battleships-frontend

# Specific pod
kubectl logs -f <pod-name>
```

### Update Deployment

After making code changes:

```bash
# Rebuild images
make build-all

# Reload images (minikube)
minikube image load battleships-backend:latest
minikube image load battleships-frontend:latest

# Restart deployments
kubectl rollout restart deployment/battleships-backend
kubectl rollout restart deployment/battleships-frontend

# Check rollout status
kubectl rollout status deployment/battleships-backend
kubectl rollout status deployment/battleships-frontend
```

### Delete Deployment

```bash
# Using Makefile
make delete-k8s

# Or manually
kubectl delete -f k8s/frontend-deployment.yaml
kubectl delete -f k8s/backend-deployment.yaml
```

---

## Production Considerations

### 1. Image Registry

For production, push images to a registry:

```bash
# Tag images
docker tag battleships-backend:latest your-registry.com/battleships-backend:v1.0.0
docker tag battleships-frontend:latest your-registry.com/battleships-frontend:v1.0.0

# Push to registry
docker push your-registry.com/battleships-backend:v1.0.0
docker push your-registry.com/battleships-frontend:v1.0.0

# Update k8s manifests with registry paths
# Change image: battleships-backend:latest
# To: your-registry.com/battleships-backend:v1.0.0
```

### 2. Environment Variables

Create ConfigMaps and Secrets:

```yaml
# config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: battleships-config
data:
  API_URL: "https://api.yourdomain.com"
```

```bash
kubectl apply -f config.yaml
```

Update deployments to use ConfigMap:

```yaml
env:
- name: API_URL
  valueFrom:
    configMapKeyRef:
      name: battleships-config
      key: API_URL
```

### 3. Ingress

For production, use Ingress instead of LoadBalancer:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: battleships-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - battleships.yourdomain.com
    secretName: battleships-tls
  rules:
  - host: battleships.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

### 4. Persistent Storage

For game state persistence (optional):

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: battleships-data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

### 5. Monitoring

Deploy monitoring stack:

```bash
# Prometheus & Grafana
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/bundle.yaml
```

### 6. Auto-scaling

Horizontal Pod Autoscaler:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: battleships-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: battleships-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 7. Health Checks

The deployments already include:
- **Liveness Probes**: Restart unhealthy containers
- **Readiness Probes**: Remove unhealthy pods from service

### 8. Security

Best practices:

```bash
# Run as non-root user
# Add to Dockerfile
USER 1000:1000

# Network Policies
# Restrict pod-to-pod communication

# Secrets Management
# Use external secret managers (HashiCorp Vault, AWS Secrets Manager)

# RBAC
# Create service accounts with minimal permissions
```

### 9. CI/CD Pipeline

Example GitHub Actions workflow:

```yaml
name: Deploy to Kubernetes

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Build and Push Images
        run: |
          docker build -t registry/backend:${{ github.sha }} ./backend
          docker build -t registry/frontend:${{ github.sha }} ./frontend
          docker push registry/backend:${{ github.sha }}
          docker push registry/frontend:${{ github.sha }}
      
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/battleships-backend backend=registry/backend:${{ github.sha }}
          kubectl set image deployment/battleships-frontend frontend=registry/frontend:${{ github.sha }}
```

---

## Troubleshooting

### Common Issues

1. **Pods not starting**
   ```bash
   kubectl describe pod <pod-name>
   kubectl logs <pod-name>
   ```

2. **ImagePullBackOff**
   - Check image name and tag
   - For local clusters, ensure images are loaded

3. **Service not accessible**
   ```bash
   kubectl get svc
   kubectl describe svc frontend
   ```

4. **WebSocket connection issues**
   - Check Nginx configuration
   - Verify WebSocket proxy settings

### Debug Commands

```bash
# Execute into pod
kubectl exec -it <pod-name> -- /bin/sh

# Port forward for testing
kubectl port-forward <pod-name> 8000:8000

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp
```

---

## Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev/)
