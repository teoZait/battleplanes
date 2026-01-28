# 🎮 Battleships Game - Manual Testing Guide

## Quick Testing Setup

### Method 1: Docker Compose (Recommended - Easiest)

1. **Start the application:**
   ```bash
   cd battleships-app
   docker-compose up --build
   ```

2. **Open TWO browser windows/tabs:**
   - Window 1: http://localhost
   - Window 2: http://localhost (incognito/private mode recommended)

3. **Test the game flow:**

   **In Window 1 (Player 1):**
   - Click "Create New Game"
   - Copy the Game ID that appears in the message
   
   **In Window 2 (Player 2):**
   - Paste the Game ID into the input field
   - Click "Join Game"
   
   **Both Windows:**
   - You should see "Both players connected. Place your ships!"
   
   **Place Ships (both players):**
   - Click "Rotate" to change orientation (Horizontal/Vertical)
   - Click on the board to place each ship:
     * Carrier (5 squares)
     * Battleship (4 squares)
     * Cruiser (3 squares)
     * Submarine (3 squares)
     * Destroyer (2 squares)
   - Click "Confirm Placement" when all ships are placed
   
   **Play the Game:**
   - Player 1 goes first (check "Turn: 🎯 Your Turn!")
   - Click on opponent's board to attack
   - Watch for "Hit" (red) or "Miss" (blue)
   - Turns alternate automatically
   - First to sink all 5 opponent ships wins!

---

## Method 2: Using Separate Browsers

To avoid any session conflicts, use different browsers:

1. **Start the app:**
   ```bash
   docker-compose up --build
   ```

2. **Player 1 - Chrome:**
   - Open http://localhost in Chrome
   - Create a new game
   - Copy the Game ID

3. **Player 2 - Firefox (or Edge, Safari):**
   - Open http://localhost in Firefox
   - Join with the Game ID

---

## Method 3: Two Devices on Same Network

1. **Find your computer's IP address:**
   ```bash
   # On Linux/Mac:
   ip addr show | grep inet
   # or
   ifconfig | grep inet
   
   # On Windows:
   ipconfig
   ```
   Look for something like `192.168.1.x`

2. **Start the app:**
   ```bash
   docker-compose up --build
   ```

3. **Player 1 - Your Computer:**
   - Open http://localhost
   - Create game and copy ID

4. **Player 2 - Phone/Tablet:**
   - Open http://YOUR_IP (e.g., http://192.168.1.50)
   - Join with the Game ID

---

## Quick Testing Checklist

### ✅ Connection Test
- [ ] Both players can connect
- [ ] Game ID is displayed and shareable
- [ ] "Both players connected" message appears

### ✅ Ship Placement Test
- [ ] Can rotate ships (Horizontal/Vertical)
- [ ] Can place all 5 ships
- [ ] Ships can't overlap
- [ ] Ships can't go out of bounds
- [ ] "Confirm Placement" button appears after all ships placed
- [ ] Both players see "Waiting for opponent" after confirming

### ✅ Gameplay Test
- [ ] "Game started!" message appears when both ready
- [ ] Turn indicator shows whose turn it is
- [ ] Can only attack on your turn
- [ ] Can't attack same cell twice
- [ ] Hit shows red with fire emoji 🔥
- [ ] Miss shows blue with water emoji 💧
- [ ] Turns alternate correctly
- [ ] Your own board shows your ships

### ✅ Game Over Test
- [ ] Winner is detected when all ships sunk
- [ ] "Game Over" message displays
- [ ] Winner is announced correctly

### ✅ Error Handling Test
- [ ] Can't attack on opponent's turn
- [ ] Can't place ships outside board
- [ ] Can't place overlapping ships
- [ ] Handles player disconnect gracefully

---

## Troubleshooting

### "Connection error" message
```bash
# Check if backend is running:
docker-compose logs backend

# Check if frontend is running:
docker-compose logs frontend

# Restart if needed:
docker-compose restart
```

### Can't connect WebSocket
```bash
# Check browser console (F12) for errors
# Look for WebSocket connection messages

# Verify backend is accessible:
curl http://localhost:8000
```

### Port already in use
```bash
# Stop the containers:
docker-compose down

# Check what's using port 80:
# Linux/Mac:
sudo lsof -i :80

# Windows:
netstat -ano | findstr :80

# Change ports in docker-compose.yaml if needed:
# frontend: "8080:80" instead of "80:80"
# Then access at http://localhost:8080
```

### Game state desync
```bash
# Refresh both browser windows
# Or restart the application:
docker-compose restart
```

---

## Expected Behavior

### Ship Placement
- Ships appear as gray/metallic rectangles
- Hover shows green preview of placement
- Placed ships have a 3D metallic effect
- Ship list shows checkmarks ✓ for placed ships

### During Battle
- **Your Board**: Shows your ships (gray) and opponent's attacks
- **Opponent's Board**: Hidden ships, shows only your attacks
- **Hit**: Red cell with 🔥 and explosion animation
- **Miss**: Blue cell with 💧 and splash animation
- **Turn Indicator**: Green "Your Turn" or gray "Opponent's Turn"

### Winning
- All opponent ships show as hits (red)
- "Game Over" message appears
- Winner displayed as "🎉 You Won!" or "😢 You Lost"

---

## Performance Tips

- **Use incognito/private mode** for second player to avoid cookie conflicts
- **Clear browser cache** if experiencing issues
- **Check browser console (F12)** for detailed error messages
- **Use Chrome DevTools Network tab** to monitor WebSocket connection

---

## Quick Commands

```bash
# Start the game
docker-compose up --build

# View logs in real-time
docker-compose logs -f

# Stop the game
docker-compose down

# Restart after code changes
docker-compose restart

# Complete cleanup
docker-compose down -v
docker-compose up --build
```

---

## Test Scenarios to Try

1. **Quick Game**: Place all ships randomly, attack randomly
2. **Strategic Game**: Place ships carefully, hunt methodically
3. **Disconnect Test**: Close one browser mid-game
4. **Reconnect Test**: Try to rejoin with same game ID
5. **Multiple Games**: Create multiple game IDs simultaneously
6. **Mobile Test**: Test on phone browser
7. **Network Test**: Test from different device on network

---

## Video Walkthrough

1. Open browser 1, create game
2. Copy Game ID
3. Open browser 2 (incognito), paste ID, join
4. Both players place ships
5. Take turns attacking
6. Win the game!

**Total test time: ~3-5 minutes**

Enjoy testing your Battleships game! ⚓