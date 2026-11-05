import express from 'express'
import cors from 'cors'
import { omrRouter } from './routes/omr.js'
import { isOriginAllowed } from './services/corsPolicy.js'
import { configuredEngine, peekEngineInfo } from './services/engineInfo.js'

const app = express()
const PORT = process.env.PORT || 3001

app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin)) callback(null, true)
    else callback(null, false)
  },
}))
app.use(express.json({ limit: '1mb' }))

app.use('/api', omrRouter)

app.get('/health', (_req, res) => {
  const info = peekEngineInfo()
  res.json({
    status: 'ok',
    engine: info.configured,
    audiverisAvailable: info.audiverisAvailable,
    oemerAvailable: info.oemerAvailable,
    versions: {
      audiveris: info.audiverisVersion,
      oemer: info.oemerVersion,
    },
  })
})

app.listen(PORT, () => {
  console.log(`PartitUp OMR Server running on port ${PORT} (OMR_ENGINE=${configuredEngine()})`)
})
