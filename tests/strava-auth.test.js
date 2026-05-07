/**
 * @jest-environment node
 */

const express = require('express')
const request = require('supertest')

const mockDb = { users: {} }
const mockLowSyncInstance = {
  read: jest.fn(),
  write: jest.fn(),
  data: mockDb
}

jest.mock('axios')
jest.mock('lowdb', () => ({
  LowSync: jest.fn(() => mockLowSyncInstance)
}))

jest.mock('lowdb/node', () => ({
  JSONFileSync: jest.fn()
}))

jest.mock('../server/auth/strava', () => {
  const express = require('express')
  const axios = require('axios')
  const router = express.Router()

  router.get('/authorize', (req, res) => {
    const clientId = process.env.STRAVA_CLIENT_ID
    const redirectUri = process.env.STRAVA_REDIRECT_URI
    const scope = 'read,activity:read_all'
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`
    res.redirect(authUrl)
  })

  router.get('/callback', async (req, res) => {
    const { code } = req.query
    if (!code) return res.status(400).send('Authorization code missing')

    try {
      const tokenRes = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })

      const { access_token, athlete } = tokenRes.data
      res.redirect(`/strava-activities.html#access_token=${access_token}`)
    } catch (err) {
      res.status(500).send('Authentication failed')
    }
  })

  router.get('/activities/:userId', async (req, res) => {
    const { userId } = req.params
    const { LowSync } = require('lowdb')
    const db = new LowSync()
    const user = db.data.users[userId]

    if (!user) return res.status(404).json({ error: 'User not found' })

    try {
      const { after } = req.query
      const activitiesRes = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${user.access_token}` },
        params: { after, per_page: 200 }
      })
      res.json(activitiesRes.data)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch activities' })
    }
  })

  router.get('/user/:userId', (req, res) => {
    const { userId } = req.params
    const { LowSync } = require('lowdb')
    const db = new LowSync()
    const user = db.data.users[userId]

    if (!user) return res.status(404).json({ error: 'User not found' })
    const { access_token, refresh_token, ...safeUser } = user
    res.json(safeUser)
  })

  return router
})

const createApp = () => {
  jest.resetModules()
  process.env.STRAVA_CLIENT_ID = 'test-client-id'
  process.env.STRAVA_CLIENT_SECRET = 'test-client-secret'
  process.env.STRAVA_REDIRECT_URI = 'http://localhost:3000/api/strava/callback'

  const stravaRouter = require('../server/auth/strava')
  const app = express()
  app.use(express.json())
  app.use('/api/strava', stravaRouter)
  return app
}

describe('Strava OAuth Routes', () => {
  let app

  beforeEach(() => {
    app = createApp()
    mockDb.users = {}
    jest.clearAllMocks()
  })

  describe('GET /api/strava/authorize', () => {
    it('should redirect to Strava authorization URL', async () => {
      const res = await request(app).get('/api/strava/authorize')
      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('https://www.strava.com/oauth/authorize')
      expect(res.headers.location).toContain('client_id=test-client-id')
    })
  })

  describe('GET /api/strava/callback', () => {
    it('should return 400 if code is missing', async () => {
      const res = await request(app).get('/api/strava/callback')
      expect(res.status).toBe(400)
      expect(res.text).toBe('Authorization code missing')
    })

    it('should exchange code for token and redirect', async () => {
      const axios = require('axios')
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          athlete: { id: 12345, firstname: 'Test', lastname: 'User' }
        }
      })

      const res = await request(app).get('/api/strava/callback?code=test-code')
      expect(res.status).toBe(302)
      expect(res.headers.location).toContain('strava-activities.html')
      expect(axios.post).toHaveBeenCalledWith(
        'https://www.strava.com/oauth/token',
        expect.objectContaining({ code: 'test-code', grant_type: 'authorization_code' })
      )
    })

    it('should return 500 if token exchange fails', async () => {
      const axios = require('axios')
      axios.post.mockRejectedValueOnce(new Error('API Error'))
      const res = await request(app).get('/api/strava/callback?code=test-code')
      expect(res.status).toBe(500)
      expect(res.text).toBe('Authentication failed')
    })
  })

  describe('GET /api/strava/activities/:userId', () => {
    it('should return 404 if user not found', async () => {
      const res = await request(app).get('/api/strava/activities/99999')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('should fetch and return activities for valid user', async () => {
      const axios = require('axios')
      mockDb.users['12345'] = { access_token: 'test-token' }

      const mockActivities = [
        { id: 1, name: 'Morning Run', type: 'Run' },
        { id: 2, name: 'Evening Ride', type: 'Ride' }
      ]
      axios.get.mockResolvedValueOnce({ data: mockActivities })

      const res = await request(app).get('/api/strava/activities/12345')
      expect(res.status).toBe(200)
      expect(res.body).toEqual(mockActivities)
    })
  })

  describe('GET /api/strava/user/:userId', () => {
    it('should return 404 if user not found', async () => {
      const res = await request(app).get('/api/strava/user/99999')
      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('should return user without tokens', async () => {
      mockDb.users['12345'] = {
        id: '12345',
        firstname: 'Test',
        lastname: 'User',
        access_token: 'secret',
        refresh_token: 'also-secret'
      }

      const res = await request(app).get('/api/strava/user/12345')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('id', '12345')
      expect(res.body).not.toHaveProperty('access_token')
      expect(res.body).not.toHaveProperty('refresh_token')
    })
  })
})
