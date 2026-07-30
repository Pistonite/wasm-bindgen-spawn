import {examples} from "../../constants.ts";
import ExampleButton from "../../components/Button.tsx";
import {Link} from "react-router";

const worker = new Worker(
	new URL('./worker.ts', import.meta.url),
	{type: 'module'}
);

const WebExample = () => {

	return (
		<>
			{examples.map((example) => (
				<ExampleButton key={example} worker={worker} method={example}/>
			))}
			<Link to={'/no-modules'}>Check out no-modules target</Link>
		</>
	);
};

export default WebExample;
