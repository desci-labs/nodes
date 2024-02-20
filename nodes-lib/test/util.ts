export const sleep = async (seconds: number) => {
  await new Promise(r => setTimeout(r, seconds));
};
