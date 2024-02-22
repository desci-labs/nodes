import axios, { AxiosResponse } from "axios";
import { ENDPOINTS } from "./api.js";
import { NODES_API_URL as API } from "./config.js";
/**
 * This function looks like all types are unions, but when called with
 * the parameter `endpoint`, the specific type of that will constrain all
 * variables in the function. Hence, it looks weird here but is nice and
 * clear when called.
 *
 * It accepts an entry from the `ENDPOINTS` const object, uses that to validate
 * the shape of the payload and type the response from the server.
*/
export async function makeRequest<
  /** Any single entry in ENDPOINTS, is inferred by argument `endpoint` */
  T extends typeof ENDPOINTS[keyof typeof ENDPOINTS]
>(
  endpoint: T,
  headers: Record<string, string>,
  payload: T["_payloadT"],
  routeTail?: string,
): Promise<T["_responseT"]> {
  const url = API + endpoint.route + (routeTail ?? "");
  let res: AxiosResponse<T["_responseT"]>;
  // post is the only method that takes a data payload
  if ( endpoint.method === "post") {
   res = await axios[endpoint.method]<typeof endpoint._responseT>(
      url,
      payload,
      { headers },
    );
  } else {
   res = await axios[endpoint.method]<typeof endpoint._responseT>(
      url,
      { headers },
    );
  };
  return res.data;
};
