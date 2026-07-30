import {FC} from "react";
import {Example, invokeWorkerMethod} from "../constants.ts";

type Props = {
	worker: Worker;
	method: Example
}
const ExampleButton: FC<Props> = ({worker, method}) => {
	return <button onClick={invokeWorkerMethod.bind(null, worker, method)}>{method}</button>;
}

export default ExampleButton;
