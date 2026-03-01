export interface UvReading {
  hour: string;
  value: number;
}

export interface UvApiResponse {
  code: number;
  errorMsg: string;
  data: {
    records: Array<{
      date: string;
      updatedTimestamp: string;
      timestamp: string;
      index: Array<{
        hour: string;
        value: number;
      }>;
    }>;
  };
}
