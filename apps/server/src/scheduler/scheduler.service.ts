import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.module';

@Injectable()
export class SchedulerService {
  private readonly log = new Logger('SchedulerService');

  constructor(private readonly prisma: PrismaService) {}

  // Every minute: find scheduled drafts whose time has come, fire reminder.
  @Cron(CronExpression.EVERY_MINUTE)
  async fireDueReminders() {
    const now = new Date();
    const due = await this.prisma.draft.findMany({
      where: {
        status: 'scheduled',
        scheduleAt: { lte: now },
      },
      take: 50,
      include: {
        account: { select: { nickname: true } },
        author: { select: { id: true } },
      },
    });
    if (due.length === 0) return;

    for (const d of due) {
      this.log.log(
        `Reminder: draft ${d.id} "${d.title ?? ''}" for account ${d.account?.nickname ?? '?'} (author ${d.author?.id})`,
      );
      // Production: dispatch wx.subscribeMessage.send via consumed subscribe_token.
      // For now we just write an audit entry; the mini-program will detect status.
      await this.prisma.auditLog.create({
        data: {
          teamId: d.teamId,
          actorId: d.authorId,
          action: 'draft.due',
          targetType: 'draft',
          targetId: d.id,
          meta: { scheduleAt: d.scheduleAt },
        },
      });
      // Move to 'due' to avoid re-firing while user hasn't acted.
      await this.prisma.draft.update({
        where: { id: d.id },
        data: { status: 'due' },
      });
    }
  }

  // Daily 21:00 — push "today's data report" reminder
  @Cron('0 21 * * *', { timeZone: 'Asia/Shanghai' })
  async fireDailyReport() {
    // Production: iterate active teams, send subscribeMessage with template id.
    this.log.log('Daily report reminder fired (stub)');
  }
}
