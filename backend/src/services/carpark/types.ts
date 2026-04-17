export interface CarparkMetadata {
  carpark_number: string;
  car_park_no?: string;
  address: string;
  latitude: number;
  longitude: number;
  car_park_type: string;
  car_park_basement: string;
  car_park_decks: number;
  gantry_height: number;
  type_of_parking_system: string;
  short_term_parking: string;
  night_parking: string;
  free_parking: string;
  distance?: number;
  x_coord?: string;
  y_coord?: string;
}

export interface CarparkAvailability {
  carpark_number: string;
  update_datetime: string;
  carpark_info: Array<{
    total_lots: string;
    lot_type: 'C' | 'H' | 'Y'; // C = Car, H = Heavy, Y = Motorcycle
    lots_available: string;
  }>;
}

export interface ParkingResponse extends CarparkMetadata {
  total_lots: number;
  lots_available: number;
  type: string;
  system: string;
}

export interface CarparkApiResponse {
  items: Array<{
    timestamp: string;
    carpark_data: CarparkAvailability[];
  }>;
}
