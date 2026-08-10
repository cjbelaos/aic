import axios from "axios";
import type {
  ScheduleEntry,
  CreateSchedulePayload,
  UpdateSchedulePayload,
  FTILinkOption,
} from "@/types/schedule";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const scheduleService = {
  async getEntries(): Promise<ScheduleEntry[]> {
    const res = await api.get<ScheduleEntry[]>("/schedule");
    return res.data;
  },

  async getFTILinkOptions(): Promise<FTILinkOption[]> {
    const res = await api.get<FTILinkOption[]>("/schedule/fti-options");
    return res.data;
  },

  async createEntry(payload: CreateSchedulePayload): Promise<ScheduleEntry> {
    const res = await api.post<ScheduleEntry>("/schedule", payload);
    return res.data;
  },

  async updateEntry(
    id: string,
    payload: UpdateSchedulePayload,
  ): Promise<ScheduleEntry> {
    const res = await api.patch<ScheduleEntry>(
      `/schedule/${encodeURIComponent(id)}`,
      payload,
    );
    return res.data;
  },

  async deleteEntry(id: string): Promise<void> {
    await api.delete(`/schedule/${encodeURIComponent(id)}`);
  },

  /**
   * Upload a Delivery Report / Service Invoice PDF to Google Drive.
   * Returns the shareable Drive link.
   */
  async uploadAttachment(
    file: File,
    kind: "deliveryReport" | "serviceInvoice",
    scheduleId: string,
    customerName: string,
    date: string,
  ): Promise<{ fileLink: string }> {
    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("kind", kind);
    fd.append("scheduleId", scheduleId);
    fd.append("customerName", customerName);
    fd.append("date", date);
    const res = await api.post("/schedule/save-attachment", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
};

export default scheduleService;
