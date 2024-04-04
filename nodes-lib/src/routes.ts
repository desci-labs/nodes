import axios, { AxiosError, AxiosResponse } from "axios";
import { ENDPOINTS } from "./api.js";
import { getNodesLibInternalConfig } from "./config/index.js";

// Default error serialization is huuuge due to circular refs
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const err = error as AxiosError;
    console.log(`
      ${err.name}: ${err.message}:
      ${err.config?.method} to ${err.config?.url} got ${err.response?.status}:${err.response?.statusText}
      Body: ${JSON.stringify(err.response?.data)}
    `);
    return Promise.reject(new Error(err.message))
  },
);

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
  const url = getNodesLibInternalConfig().apiUrl + endpoint.route + (routeTail ?? "");
  let res: AxiosResponse<T["_responseT"]>;
  // post is the only method that takes a data payload
  if ( endpoint.method === "post") {
   res = await axios[endpoint.method]<typeof endpoint._responseT>(
      url,
      payload,
      { headers, withCredentials: true },
    );
  } else {
   res = await axios[endpoint.method]<typeof endpoint._responseT>(
      url,
      { headers, withCredentials: true },
    );
  };
  return res.data;
};
