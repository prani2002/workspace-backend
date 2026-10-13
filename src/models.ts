import mongoose, { Schema } from 'mongoose';

const User = mongoose.model(
  'User',
  new Schema(
    {
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
      role: { type: String, enum: ['admin', 'member', 'viewer'], default: 'member' },
      name: { type: String, trim: true },
      failedLogins: { type: Number, default: 0 },
      lockedUntil: Date,
      deletedAt: Date
    },
    { timestamps: true }
  )
);

const RefreshToken = mongoose.model(
  'RefreshToken',
  new Schema({
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: Date,
    revokedAt: Date
  })
);

const IdempotencyKey = mongoose.model(
  'IdempotencyKey',
  new Schema({
    key: { type: String, required: true },
    userId: { type: String, required: true },
    requestHash: { type: String, required: true },
    state: { type: String, enum: ['in_progress', 'done'], required: true },
    status: Number,
    body: Schema.Types.Mixed,
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
  }).index({ userId: 1, key: 1 }, { unique: true })
);

const AuditLog = mongoose.model(
  'AuditLog',
  new Schema({
    at: { type: Date, default: Date.now, index: true },
    action: { type: String, required: true },
    userId: String,
    target: String,
    ip: String,
    requestId: String,
    meta: Schema.Types.Mixed
  })
);

const AgentRun = mongoose.model(
  'AgentRun',
  new Schema(
    {
      userId: { type: String, required: true, index: true },
      agent: { type: String, required: true },
      input: { type: String, required: true },
      output: Schema.Types.Mixed,
      status: { type: String, enum: ['ok', 'error'], required: true },
      errorCode: String,
      ms: Number
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  ).index({ createdAt: -1 })
);

const Setting = mongoose.model('Setting', new Schema({ key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed }));

export { User, RefreshToken, IdempotencyKey, AuditLog, AgentRun, Setting };
