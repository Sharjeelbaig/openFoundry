import { redirect } from "next/navigation";

export default function ModelsIndex() {
  redirect("/build/models/deployments");
}
