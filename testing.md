# Battleplanes - Manual Testing Guide

## Quick Testing Setup

### Method 1: Docker Compose (Recommended)

1. **Start the application:**
   ```bash
   docker compose up --build
   ```

2. **Open TWO browser windows/tabs:**
   - Window 1: http://localhost
   - Window 2: http://localhost (incognito/private mode recommended)

3. **Test the game flow:**

   **In Window 1 (Player 1):**
   - Click "Create New Game"
   - Copy the Game ID that appears

   **In Window 2 (Player 2):**
   - Paste the Game ID into the input field
   - Click "Join Game"

   **Both Windows:**
   - You should see "Both players connected. Place your planes!"

   **Place Planes (both players):**
   - Click "Rotate" to change orientation (UP/RIGHT/DOWN/LEFT)
   - Click on the board to place the cockpit (head)
   - Place 2 planes total
   - Click "Confirm Placement" when done

   **Play the Game:**
   - Player 1 goes first (check the turn indicator)
   - Click on opponent's board to attack
   - Body hit = fire, Cockpit hit = explosion, Miss = water
   - Turns alternate automatically
   - Destroy both enemy cockpits to win!

---

### Method 2: Using Separate Browsers

To avoid any session conflicts, use different browsers:

1. **Start the app:**
   ```bash
   docker compose up --build
   ```

2. **Player 1 - Chrome:** Open http://localhost, create a game, copy the Game ID

3. **Player 2 - Firefox (or Edge, Safari):** Open http://localhost, join with the Game ID

---

### Method 3: Two Devices on Same Network

1. **Find your computer's IP address:**
   ```bash
   # macOS
   ifconfig | grep "inet "

   # Linux
   ip addr show | grep inet
   ```
   Look for something like `192.168.1.x`

2. **Start the app:**
   ```bash
   docker compose up --build
   ```

3. **Player 1 - Your Computer:** Open http://localhost

4. **Player 2 - Phone/Tablet:** Open http://YOUR_IP (e.g., http://192.168.1.50)

---

## Testing Checklist

### Connection
- [ ] Both players can connect
- [ ] Game ID is displayed and shareable
- [ ] "Both players connected" message appears

### Plane Placement
- [ ] Can rotate planes (UP/RIGHT/DOWN/LEFT)
- [ ] Can place 2 planes
- [ ] Planes can't overlap
- [ ] Planes can't go out of bounds
- [ ] "Confirm Placement" button appears after both planes placed
- [ ] Both players see waiting state after confirming

### Gameplay
- [ ] Game starts when both players confirm placement
- [ ] Turn indicator shows whose turn it is
- [ ] Can only attack on your turn
- [ ] Can't attack same cell twice
- [ ] Body hit shows fire animation
- [ ] Cockpit hit shows explosion animation
- [ ] Miss shows water animation
- [ ] Turns alternate correctly

### Game Over
- [ ] Winner detected when both cockpits destroyed
- [ ] Game over message displays correctly
- [ ] Winner announced correctly

### Reconnection
- [ ] Closing and reopening the tab reconnects to the game
- [ ] Board state is restored on reconnect
- [ ] Session token auth prevents hijacking

### Error Handling
- [ ] Can't attack on opponent's turn
- [ ] Can't place planes outside board
- [ ] Can't place overlapping planes
- [ ] Handles player disconnect gracefully

---

## Automated Tests

### Backend

```bash
docker compose run --rm backend python -m pytest tests/ -v
```

### Frontend

```bash
cd frontend
docker run --rm -v "$(pwd)":/app -w /app node:18-alpine \
  sh -c "npm install --silent 2>/dev/null && npx vitest run --reporter=verbose"
```

---

## Troubleshooting

### "Connection error" message
```bash
# Check if services are running
docker compose logs backend
docker compose logs frontend

# Restart if needed
docker compose restart
```

### Can't connect WebSocket
```bash
# Check browser console (F12) for errors

# Verify backend is accessible
curl http://localhost:8000
```

### Port already in use
```bash
# Stop the containers
docker compose down

# Check what's using port 80
sudo lsof -i :80

# Change ports in docker-compose.yaml if needed:
# frontend: "8080:80" instead of "80:80"
# Then access at http://localhost:8080
```

---

## Test Scenarios

1. **Quick Game** - Place planes randomly, attack randomly
2. **Disconnect Test** - Close one browser mid-game, reopen it
3. **Reconnect Test** - Verify board state restores after reconnection
4. **Multiple Games** - Create multiple game IDs simultaneously
5. **Mobile Test** - Test on phone browser
6. **Network Test** - Test from different device on same network
