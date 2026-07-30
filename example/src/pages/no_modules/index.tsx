import {FC} from "react";
import {examples} from "../../constants.ts";
import ExampleButton from "../../components/Button.tsx";
import { Link } from 'react-router';

const worker = new Worker("/worker.js");

const NoModulesExample: FC = () => {

	return(
		<>
			{examples.map((example) => (
				<ExampleButton key={example} worker={worker} method={example} />
			))}

			<Link to={'/web'}>Check out web target</Link>
		</>
	);
};

export default NoModulesExample;
