# Phase 2 Judge Testing Guide

## ✅ What's Been Implemented

### Backend
- **JudgeService** - Complete judge session and scoring management
- **JudgeScore Model** - 5-decimal precision (0.00000-5.00000) with lock functionality
- **JudgeSession Model** - Track active judge sessions per cup
- **API Endpoints** - Full CRUD for sessions, scoring, locking, and unlocking
- **Cup Management** - Create/update cups and assign queue items

### Frontend
- **PrecisionSlider Component** - Beautiful 5-decimal slider with:
  - Visual star display
  - Large numeric readout
  - Direct numeric input
  - Quick-set buttons
  - Tactile feedback
- **JudgePage** - Complete judge interface with:
  - Session management
  - Anonymized video display
  - Score submission
  - Vote locking/unlocking
  - Real-time status updates

## 🧪 Testing Instructions

### 1. Setup Test Data
```bash
cd server
node test-phase2-setup.js
```

This creates:
- Test channel: `test_channel`
- Test cup with 3 videos
- Test users as submitters
- **3 judge tokens with unique URLs** (no login required!)

### 2. Start the Application

**Terminal 1 - Backend:**
```bash
cd server
npm start
```

**Terminal 2 - Frontend:**
```bash
cd client
npm start
```

### 3. Access Judge Page

Copy one of the judge URLs from the test script output. Each URL includes a unique token that:
- Authenticates the judge automatically (no Twitch login needed)
- Grants access only to the specific cup
- Includes the judge's display name
- Expires after 7 days

Example URL format:
```
http://localhost:3000/judge/test_channel/{cupId}?token={jwtToken}
```

Open multiple URLs in different browsers/tabs to simulate multiple judges!

### 4. Testing Workflow

#### Basic Scoring Flow
1. Navigate to judge page URL
2. Session should auto-start
3. Set a video as "currently playing" (via admin or socket event)
4. Use the precision slider to rate (0.00000 - 5.00000)
5. Add optional comment
6. Click "Submit Score"
7. Verify score is saved

#### Lock/Unlock Testing
1. After submitting a score, click "Lock Vote"
2. Slider should become disabled
3. Try to change score (should be blocked)
4. Click "Unlock Vote" (only works for MANUAL locks)
5. Slider should re-enable

#### Force Lock Testing (Host)
1. Use API or admin interface to force-lock all votes
2. Judge page should show "Force Locked" status
3. Judge cannot unlock (only host can remove forced locks)

### 5. API Testing with cURL

**Note:** With token-based authentication, you no longer need session cookies! Just include the token.

**Start Judge Session:**
```bash
TOKEN="your-judge-token-here"
CHANNEL="test_channel"
CUP_ID="your-cup-id-here"

curl -X POST "http://localhost:5000/api/channels/${CHANNEL}/cups/${CUP_ID}/judge/session/start" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Submit Score:**
```bash
curl -X POST "http://localhost:5000/api/channels/${CHANNEL}/cups/${CUP_ID}/items/1/score" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"score": 4.27583, "comment": "Great submission!"}'
```

**Lock Vote:**
```bash
curl -X POST "http://localhost:5000/api/channels/${CHANNEL}/cups/${CUP_ID}/items/1/lock" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Get Your Score:**
```bash
curl "http://localhost:5000/api/channels/${CHANNEL}/cups/${CUP_ID}/items/1/score" \
  -H "Authorization: Bearer ${TOKEN}"
```

**Generate New Judge Link (requires HOST role & Twitch auth):**
```bash
curl -X POST "http://localhost:5000/api/channels/${CHANNEL}/cups/${CUP_ID}/judge-link" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{"judgeName": "New Judge", "expiresIn": "7d"}'
```

## 🎯 Test Scenarios

### Scenario 1: Multiple Judges
1. Run `node test-phase2-setup.js` to get 3 judge URLs
2. Open each URL in a different browser/incognito window
3. No login required - each token authenticates automatically
4. Each judge scores the same video
5. Verify all scores are saved independently
6. Check average calculation

### Scenario 2: Lock States
1. Judge A (Alice) submits and manually locks
2. Judge B (Bob) submits without locking
3. Host force-locks all votes (via API)
4. Judge A cannot unlock (already manually locked)
5. Judge B gets force-locked
6. Host removes all forced locks
7. Judge A still locked (manual), Judge B unlocked

### Scenario 3: Score Precision
1. Use slider to set: 3.14159
2. Submit score
3. Reload page
4. Verify score shows as 3.14159 (exact 5 decimals)

### Scenario 4: Session Management
1. Start session (creates/reactivates)
2. Submit scores for multiple videos
3. End session
4. Start new session (reactivates)
5. Previous scores should still be available

## 🔍 Verification Points

- ✅ Scores stored with 5-decimal precision
- ✅ Lock status persists across reloads
- ✅ Force locks cannot be unlocked by judges
- ✅ Manual locks can be toggled by judge
- ✅ Multiple judges can score independently
- ✅ Session creation idempotent
- ✅ Comments save and load correctly
- ✅ Score range enforced (0.00000-5.00000)

## 🐛 Known Limitations / TODOs

1. **No Real-time Video Sync** - Judges need manual notification of which video is playing
2. **No Socket Events Yet** - Score updates don't broadcast to other clients in real-time
3. **No Host Control Panel** - Force lock/unlock requires direct API calls
4. **No Reveal Animation** - Score reveal UI not implemented
5. **No Submitter Anonymization** - Video metadata shows real submitter
6. **Token stored in URL** - Consider moving to session storage after initial auth

## 🚀 Next Phase Features

- Real-time socket events for score updates
- Host control panel with reveal controls
- Scoring reveal animations
- Anonymized submitter names (fake username generation)
- Cup leaderboard display
- Series progression tracking

## 📝 Notes

- **No Twitch authentication required for judges!** Just use the generated URL with token
- Judge tokens expire after 7 days (configurable when generating)
- Each token is scoped to a specific cup and channel
- Tokens can be generated via API by users with HOST, PRODUCER, MANAGER, or OWNER roles
- Cup must be in LIVE status for active judging
- Video must be assigned to cup (`cupId` field on QueueItem)
- Token includes judge display name for identification

---

**Latest Test Run Cup ID:** Check the test script output for the current cup ID  
**Get Judge URLs:** Run `node test-phase2-setup.js` to generate fresh tokens and URLs
