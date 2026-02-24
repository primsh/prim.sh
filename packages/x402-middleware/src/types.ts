export interface X402Price {
  amount: string;
  currency: string;
}

export interface X402RouteConfig {
  path: string;
  method: string;
  price: X402Price;
}

export interface X402MiddlewareOptions {
  facilitatorUrl: string;
  network: string;
}

