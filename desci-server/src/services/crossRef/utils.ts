export function keysToDotsAndDashses(param: any) {
  if (isObject(param)) {
    const r = {};
    Object.keys(param).forEach((key) => {
      r[toDotsAndDashes(key)] = keysToDotsAndDashses(param[key]);
    });
    return r;
  } else if (Array.isArray(param)) {
    return param.map((param) => keysToDotsAndDashses(param));
  }

  return param;
}

const isObject = (o: any) => Object(o) === o && !Array.isArray(o) && typeof o !== 'function';

const toDotsAndDashes = (str: string) => {
  str = str.replace(/query[A-Z]/, (match) => `query.${match.slice(-1)}`);
  str = str.replace(/[A-Z]/g, (match) => match.toLowerCase());
  return str;
};

export const getOrcidFromURL = (orcid: string) => {
  const pattern = /[^/]+$/;
  const match = orcid.match(pattern);
  return match ? match[0] : orcid;
};
