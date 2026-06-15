export interface MailboxPermissions {
  may_receive: boolean;
  may_send: boolean;
  may_access_imap: boolean;
  may_access_pop3: boolean;
}

export class MigaduClient {
  private baseUrl: string;
  private authHeader: string;

  constructor() {
    const apiUser = process.env.MIGADU_API_USER;
    const apiKey = process.env.MIGADU_API_KEY;

    if (!apiUser || !apiKey) {
      throw new Error("Missing Migadu credentials (MIGADU_API_USER / MIGADU_API_KEY)");
    }

    this.baseUrl = "https://api.migadu.com/v1";
    // Setup Basic Authentication using Node.js Buffer
    const credentials = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  private async request<T = any>(
    path: string, 
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET", 
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Authorization": this.authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = { message: errorText };
      }
      throw new Error(
        `Migadu API Error: [${response.status}] ${parsedError.message || response.statusText}`
      );
    }

    // DELETE request might return empty body or status 204
    if (response.status === 204 || method === "DELETE") {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  // ==========================================
  // DOMAIN METHODS
  // ==========================================

  /**
   * Registers a new domain in Migadu.
   */
  async createDomain(domainName: string): Promise<any> {
    return this.request("/domains", "POST", { name: domainName });
  }

  /**
   * Retrieves domain config, status, and suggested DNS records.
   */
  async getDomainDetails(domainName: string): Promise<any> {
    return this.request(`/domains/${domainName}`);
  }

  // ==========================================
  // MAILBOX METHODS
  // ==========================================

  /**
   * Creates a mailbox inside a domain.
   */
  async createMailbox(
    domainName: string, 
    localPart: string, 
    password?: string, 
    quotaMb: number = 1024
  ): Promise<any> {
    const payload: any = {
      local_part: localPart.toLowerCase(),
      name: localPart,
      // 1 MB = 1,048,576 Bytes
      quota_bytes: quotaMb * 1024 * 1024,
    };

    if (password) {
      payload.password = password;
    } else {
      payload.password_method = "invitation";
    }

    return this.request(`/domains/${domainName}/mailboxes`, "POST", payload);
  }

  /**
   * Updates the password for a mailbox.
   */
  async updateMailboxPassword(
    domainName: string, 
    localPart: string, 
    password?: string
  ): Promise<any> {
    return this.request(`/domains/${domainName}/mailboxes/${localPart}`, "PUT", {
      password
    });
  }

  /**
   * Modifies the operational permissions of a mailbox.
   * Useful for pausing mailboxes when subscriptions fail.
   */
  async updateMailboxPermissions(
    domainName: string,
    localPart: string,
    permissions: Partial<MailboxPermissions>
  ): Promise<any> {
    return this.request(`/domains/${domainName}/mailboxes/${localPart}`, "PUT", permissions);
  }

  /**
   * Deletes a mailbox.
   */
  async deleteMailbox(domainName: string, localPart: string): Promise<any> {
    return this.request(`/domains/${domainName}/mailboxes/${localPart}`, "DELETE");
  }

  /**
   * Lists all mailboxes of a domain.
   */
  async listMailboxes(domainName: string): Promise<any[]> {
    const response = await this.request(`/domains/${domainName}/mailboxes`);
    // Migadu response structure for list: { mailboxes: [...] }
    return response.mailboxes || [];
  }
}
