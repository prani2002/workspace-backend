import { Setting } from '../models';

/** Maintenance flag: env default, overridable at runtime from the admin API (stored in Mongo, cached 5 s). */
export class MaintenanceState {
  private enabled: boolean;
  private checkedAt = 0;

  constructor(private readonly initial: boolean) {
    this.enabled = initial;
  }

  async isEnabled(): Promise<boolean> {
    if (Date.now() - this.checkedAt > 5000) {
      try {
        const doc = await Setting.findOne({ key: 'maintenance' }).lean();
        this.enabled = doc ? Boolean(doc.value) : this.initial;
      } catch {
        /* keep the last known value if the DB is unreachable */
      }
      this.checkedAt = Date.now();
    }
    return this.enabled;
  }

  async set(enabled: boolean) {
    await Setting.updateOne({ key: 'maintenance' }, { $set: { value: enabled } }, { upsert: true });
    this.enabled = enabled;
    this.checkedAt = Date.now();
  }
}
