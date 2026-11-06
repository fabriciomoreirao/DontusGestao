import { commentFormatting } from "@/lib/comment-formatting";
import MessageText from "@/app/MessageText";

export default function FormattedText({text}:{text:string}) {
  return <span className="formatted-comment-text">{commentFormatting(text).map((part,index)=>part.bold?<strong key={index}><MessageText text={part.text}/></strong>:<MessageText key={index} text={part.text}/>)}</span>;
}
