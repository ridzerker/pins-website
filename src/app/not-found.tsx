import Link from "next/link";
import { DocumentPage } from "@/components/site";
export default function NotFound() { return <DocumentPage label="A LITTLE OFF THE MAP" title="This place isn’t here." intro="The page you’re looking for may have moved, or the link may be incorrect."><Link href="/">Head back to Pins →</Link></DocumentPage>; }
