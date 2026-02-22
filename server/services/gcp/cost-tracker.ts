import { EventEmitter } from 'events';

export interface CostData {
  date: Date;
  service: string;
  sku: string;
  amount: number;
  currency: string;
  projectId?: string;
}

export interface CostBreakdown {
  date: Date;
  services: Record<string, number>;
  total: number;
  forecast?: number;
}

export interface AgentCostData {
  provider: 'copilot' | 'claude' | 'gemini';
  calls: number;
  costPerCall: number;
  totalCost: number;
  period: string;
}

export class CostTracker extends EventEmitter {
  private bigQuery: any | null = null;
  private bigQueryInitPromise: Promise<void> | null = null;
  private projectId: string;
  private datasetId = 'billing';
  private tableId = 'gcp_billing_export_v1';

  constructor(projectId: string) {
    super();
    this.projectId = projectId;
  }

  private async ensureBigQuery() {
    if (this.bigQuery) return;
    if (this.bigQueryInitPromise) {
      await this.bigQueryInitPromise;
      return;
    }

    this.bigQueryInitPromise = (async () => {
      try {
        const packageName: string = '@google-cloud/bigquery';
        const { BigQuery } = await import(packageName);
        this.bigQuery = new BigQuery({ projectId: this.projectId });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `BigQuery SDK is unavailable. Install @google-cloud/bigquery and restart the server. Root cause: ${reason}`
        );
      }
    })();

    await this.bigQueryInitPromise;
  }

  /**
   * Get current month cost
   */
  async getCurrentMonthCost(): Promise<number> {
    try {
      await this.ensureBigQuery();
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const query = `
        SELECT SUM(cost) as totalCost
        FROM \`${this.projectId}.${this.datasetId}.${this.tableId}\`
        WHERE invoice_month = FORMAT_DATE('%Y%m', @month_start)
          AND project_id = @project_id
      `;

      const options = {
        query,
        params: {
          month_start: monthStart,
          project_id: this.projectId,
        },
      };

      const [rows] = await this.bigQuery.query(options);
      return rows[0]?.totalCost || 0;
    } catch (error) {
      console.error('Failed to get current month cost:', (error instanceof Error ? error.message : String(error)));
      return 0;
    }
  }

  /**
   * Get cost breakdown by service
   */
  async getCostBreakdown(): Promise<CostBreakdown> {
    try {
      await this.ensureBigQuery();
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const query = `
        SELECT 
          service.description as service,
          SUM(cost) as amount
        FROM \`${this.projectId}.${this.datasetId}.${this.tableId}\`
        WHERE invoice_month = FORMAT_DATE('%Y%m', @month_start)
          AND project_id = @project_id
        GROUP BY service.description
        ORDER BY amount DESC
      `;

      const options = {
        query,
        params: {
          month_start: monthStart,
          project_id: this.projectId,
        },
      };

      const [rows] = await this.bigQuery.query(options);

      const services: Record<string, number> = {};
      let total = 0;

      rows.forEach((row: any) => {
        const amount = parseFloat(row.amount) || 0;
        services[row.service] = amount;
        total += amount;
      });

      const breakdown: CostBreakdown = {
        date: new Date(),
        services,
        total,
        forecast: this.forecastMonthEndCost(total),
      };

      this.emit('cost:breakdown', breakdown);
      return breakdown;
    } catch (error) {
      console.error('Failed to get cost breakdown:', (error instanceof Error ? error.message : String(error)));
      return {
        date: new Date(),
        services: {},
        total: 0,
      };
    }
  }

  /**
   * Get historical costs (last 12 months)
   */
  async getHistoricalCosts(): Promise<Array<{ month: string; cost: number }>> {
    try {
      await this.ensureBigQuery();
      const query = `
        SELECT 
          invoice_month as month,
          SUM(cost) as cost
        FROM \`${this.projectId}.${this.datasetId}.${this.tableId}\`
        WHERE project_id = @project_id
          AND invoice_month >= FORMAT_DATE('%Y%m', DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH))
        GROUP BY invoice_month
        ORDER BY invoice_month DESC
      `;

      const options = {
        query,
        params: {
          project_id: this.projectId,
        },
      };

      const [rows] = await this.bigQuery.query(options);

      return rows.map((row: any) => ({
        month: row.month,
        cost: parseFloat(row.cost) || 0,
      }));
    } catch (error) {
      console.error('Failed to get historical costs:', (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  /**
   * Track agent API costs
   */
  trackAgentCost(data: AgentCostData): void {
    this.emit('agent:cost', data);
  }

  /**
   * Get agent costs breakdown
   */
  async getAgentCosts(): Promise<AgentCostData[]> {
    try {
      // This would ideally query from a tracking table
      // For now, return mock data
      return [
        {
          provider: 'gemini',
          calls: 250,
          costPerCall: 0.0001,
          totalCost: 25.0,
          period: 'this-month',
        },
        {
          provider: 'claude',
          calls: 150,
          costPerCall: 0.3,
          totalCost: 45.0,
          period: 'this-month',
        },
        {
          provider: 'copilot',
          calls: 1,
          costPerCall: 20.0,
          totalCost: 20.0,
          period: 'this-month',
        },
      ];
    } catch (error) {
      console.error('Failed to get agent costs:', (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  /**
   * Forecast month-end cost
   */
  private forecastMonthEndCost(currentCost: number): number {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();

    if (currentDay === 0) return currentCost;

    const dailyAverage = currentCost / currentDay;
    return dailyAverage * daysInMonth;
  }

  /**
   * Get cost by project (multi-tenant)
   */
  async getCostByProject(): Promise<Array<{ project: string; cost: number }>> {
    try {
      await this.ensureBigQuery();
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const query = `
        SELECT 
          project_id as project,
          SUM(cost) as cost
        FROM \`${this.projectId}.${this.datasetId}.${this.tableId}\`
        WHERE invoice_month = FORMAT_DATE('%Y%m', @month_start)
        GROUP BY project_id
        ORDER BY cost DESC
      `;

      const options = {
        query,
        params: {
          month_start: monthStart,
        },
      };

      const [rows] = await this.bigQuery.query(options);

      return rows.map((row: any) => ({
        project: row.project,
        cost: parseFloat(row.cost) || 0,
      }));
    } catch (error) {
      console.error('Failed to get cost by project:', (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }
}

export default CostTracker;
