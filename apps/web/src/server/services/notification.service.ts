export interface NotifyPayload {
  text: string;
  pdfPath?: string;
  pdfCaption?: string;
}

export const notificationService = {
  async sendReminder(telegramText: string, slackText: string) {
    const { sendReminderText } =
      await import("@/server/legacy/pay-credit-cards/notify");
    return sendReminderText(telegramText, slackText);
  },

  async sendSummaryPdf(pdfPath: string, title: string) {
    const { notifySummaryPdf } =
      await import("@/server/legacy/pay-credit-cards/notify");
    return notifySummaryPdf(pdfPath, title);
  },

  async notifyAll(payload: NotifyPayload) {
    if (payload.pdfPath && payload.pdfCaption) {
      await this.sendSummaryPdf(payload.pdfPath, payload.pdfCaption);
    }
    if (payload.text) {
      await this.sendReminder(payload.text, payload.text);
    }
  },
};
