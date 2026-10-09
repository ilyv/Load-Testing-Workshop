import { SharedArray } from "k6/data";
import exec from "k6/execution";

const users = new SharedArray("users", () => JSON.parse(open("./data/users.json")));

export function currentUser() {
  return users[(exec.vu.idInTest - 1) % users.length];
}
