/**
 * MySpares API — server entry point.
 * Mounts all module routes under /api/v1 with helmet, CORS, rate limiting,
 * pino logging, Socket.IO, and graceful shutdown.
 */
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import pino from 'pino';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from './shared/db/redis.js';
import { prisma } from './shared/db/prisma.js';
import { AppError } from './shared/errors/codes.js';

// ── Module routes ──────────────────────────────────────────────────────────
import authRoutes         from './modules/auth/auth.routes.js';
import usersRoutes        from './modules/users/users.routes.js';
import vehiclesRoutes     from './modules/vehicles/vehicles.routes.js';
import catalogRoutes      from './modules/catalog/catalog.routes.js';
import cartRoutes         from './modules/cart/cart.routes.js';
import inventoryRoutes    from './modules/inventory/inventory.routes.js';
import ordersRoutes       from './modules/orders/orders.routes.js';
import paymentsRoutes     from './modules/payments/payments.routes.js';
import fulfilmentRoutes   from './modules/fulfilment/fulfilment.routes.js';
import procurementRoutes  from './modules/procurement/procurement.routes.js';
import logisticsRoutes    from './modules/logistics/logistics.routes.js';
import posRoutes          from './modules/pos/pos.routes.js';
import financeRoutes      from './modules/finance/finance.routes.js';
import reportsRoutes      from './modules/reports/reports.routes.js';
import auditRoutes        from './modules/audit/audit.routes.js';
import settingsRoutes     from './modules/settings/settings.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';

// ── Logger ─────────────────────────────────────────────────────────────────
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password',
           'body.otp', 'body.code', 'body.token', 'body.nationalId'],
});

// ── Express app ────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);

// Trust proxy (Nginx / load balancer)
const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS || '0');
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow CDN images
}));

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ── Rate limiting ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60_000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
});

const authLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: { code: 'RATE_LIMITED', message: 'Too many auth attempts' } } });
const searchLimiter = rateLimit({ windowMs: 60_000, max: 60 });
const checkoutLimiter = rateLimit({ windowMs: 60_000, max: 20 });

app.use(globalLimiter);

// ── Admin IP allowlist ─────────────────────────────────────────────────────
const adminAllowlist = (process.env.ADMIN_IP_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);

function adminIpGuard(req, res, next) {
  if (adminAllowlist.length === 0) return next();
  const ip = req.ip || '';
  const allowed = adminAllowlist.some(cidr => ip.startsWith(cidr.replace('/32', '').replace('/24', '')));
  if (!allowed) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access restricted by IP' } });
  next();
}

// ── Body parsing ───────────────────────────────────────────────────────────
// Raw body needed for Stripe webhook signature verification
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ── Logging ────────────────────────────────────────────────────────────────
app.use(pinoHttp({ logger, autoLogging: { ignore: req => req.url === '/health' } }));

// ── Health checks ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    return res.json({ status: 'ok', db: 'ok', redis: 'ok' });
  } catch (e) {
    return res.status(503).json({ status: 'error', message: e.message });
  }
});

// ── API routes — /api/v1 ───────────────────────────────────────────────────
const api = express.Router();

// Auth (rate-limited)
api.use('/auth',  authLimiter, authRoutes);

// Public routes (no auth required)
api.use('/search', searchLimiter);
api.use('/', vehiclesRoutes);
api.use('/', catalogRoutes);
api.use('/cart', cartRoutes);

// Customer routes
api.use('/', usersRoutes);

// Order + checkout (rate-limited checkout)
api.use('/checkout', checkoutLimiter);
api.use('/', ordersRoutes);
api.use('/', paymentsRoutes);

// Admin routes (IP guarded)
api.use('/admin',        adminIpGuard, inventoryRoutes);
api.use('/admin',        adminIpGuard, fulfilmentRoutes);
api.use('/admin',        adminIpGuard, procurementRoutes);
api.use('/admin',        adminIpGuard, logisticsRoutes);
api.use('/admin/finance', adminIpGuard, financeRoutes);
api.use('/admin',        adminIpGuard, reportsRoutes);
api.use('/admin/audit-logs', adminIpGuard, auditRoutes);
api.use('/admin/settings',   adminIpGuard, settingsRoutes);
api.use('/admin/notifications', adminIpGuard, notificationsRoutes);

// POS routes (IP guarded)
api.use('/pos', adminIpGuard, posRoutes);

app.use('/api/v1', api);

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (AppError.isAppError(err)) {
    return res.status(err.status || 400).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details || undefined,
        requestId: req.id,
      },
    });
  }

  // CORS error
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } });
  }

  req.log?.error({ err }, 'Unhandled error');
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');

  const isProd = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: isProd ? 'An unexpected error occurred' : err.message,
      requestId: req.id,
    },
  });
});

// ── Socket.IO ──────────────────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
  path: '/rt',
});

// Redis adapter for horizontal scaling
const pubClient = redis.duplicate();
const subClient = redis.duplicate();
io.adapter(createAdapter(pubClient, subClient));

// Real-time event broadcast (workers publish to Redis pub/sub)
subClient.subscribe('rt:event', (err) => {
  if (err) logger.error({ err }, 'Socket.IO Redis subscribe error');
});
subClient.on('message', (channel, message) => {
  if (channel !== 'rt:event') return;
  try {
    const data = JSON.parse(message);
    const { type, aggregateType, aggregateId, payload } = data;

    // Broadcast to relevant rooms
    if (type === 'inventory.changed') {
      io.to('staff:inventory').emit('inventory.changed', payload);
    } else if (type?.startsWith('order.')) {
      io.to('staff:orders').emit(type, payload);
      if (payload?.customerId) io.to(`customer:${payload.customerId}`).emit(type, payload);
    } else if (type === 'payment.updated') {
      if (payload?.registerId) io.to(`pos:${payload.registerId}`).emit('payment.updated', payload);
    } else if (type === 'alert.raised') {
      io.to('staff:alerts').emit('alert.raised', payload);
    }
  } catch (e) {
    logger.error({ e }, 'Socket.IO message parse error');
  }
});

io.on('connection', socket => {
  const token = socket.handshake.auth?.token;
  // Join rooms based on JWT claims (simplified — add proper JWT verify here)
  socket.on('join', rooms => {
    if (Array.isArray(rooms)) rooms.forEach(r => socket.join(r));
  });
  socket.on('disconnect', () => {});
});

// ── Start server ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000');
httpServer.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV }, 'MySpares API started');
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully...');
  httpServer.close(async () => {
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 30_000); // force exit after 30s
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
