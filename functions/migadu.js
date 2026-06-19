const axios = require('axios');

class MigaduClient {
  constructor(apiUser, apiKey) {
    if (!apiUser || !apiKey) {
      throw new Error("Missing Migadu credentials (apiUser / apiKey)");
    }
    this.client = axios.create({
      baseURL: "https://api.migadu.com/v1",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      auth: {
        username: apiUser,
        password: apiKey
      }
    });
  }

  /**
   * Registers a new domain in Migadu.
   */
  async createDomain(domainName) {
    const res = await this.client.post("/domains", { name: domainName });
    return res.data;
  }

  /**
   * Retrieves domain config, status, and suggested DNS records.
   */
  async getDomainDetails(domainName) {
    const res = await this.client.get(`/domains/${domainName}`);
    return res.data;
  }

  /**
   * Creates a mailbox inside a domain.
   */
  async createMailbox(domainName, localPart, password, quotaMb = 1024) {
    const payload = {
      local_part: localPart.toLowerCase(),
      name: localPart,
      quota_bytes: quotaMb * 1024 * 1024,
    };

    if (password) {
      payload.password = password;
    } else {
      payload.password_method = "invitation";
    }

    const res = await this.client.post(`/domains/${domainName}/mailboxes`, payload);
    return res.data;
  }

  /**
   * Updates the password for a mailbox.
   */
  async updateMailboxPassword(domainName, localPart, password) {
    const res = await this.client.put(`/domains/${domainName}/mailboxes/${localPart}`, {
      password
    });
    return res.data;
  }

  /**
   * Modifies the operational permissions of a mailbox.
   */
  async updateMailboxPermissions(domainName, localPart, permissions) {
    const res = await this.client.put(`/domains/${domainName}/mailboxes/${localPart}`, permissions);
    return res.data;
  }

  /**
   * Deletes a domain from Migadu.
   */
  async deleteDomain(domainName) {
    const res = await this.client.delete(`/domains/${domainName}`);
    return res.data;
  }

  /**
   * Deletes a mailbox.
   */
  async deleteMailbox(domainName, localPart) {
    const res = await this.client.delete(`/domains/${domainName}/mailboxes/${localPart}`);
    return res.data;
  }

  /**
   * Lists all mailboxes of a domain.
   */
  async listMailboxes(domainName) {
    const res = await this.client.get(`/domains/${domainName}/mailboxes`);
    return res.data.mailboxes || [];
  }
}

module.exports = { MigaduClient };
