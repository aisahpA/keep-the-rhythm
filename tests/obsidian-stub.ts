/** Minimal `moment` stand-in for Node test runs; real moment is provided
 *  by the Obsidian runtime at plugin load. */
type MomentStub = {
	format: (fmt: string) => string;
	clone: () => { endOf: () => { valueOf: () => number } };
	startOf: () => { toDate: () => Date };
	toDate: () => Date;
};

const stubMoment = (input?: Date): MomentStub => {
	const d = input ? new Date(input) : new Date();
	const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	return {
		format: () => iso,
		clone: () => ({ endOf: () => ({ valueOf: () => d.getTime() }) }),
		startOf: () => ({ toDate: () => d }),
		toDate: () => d,
	};
};

export const moment = stubMoment as unknown as {
	default: typeof stubMoment;
};
moment.default = stubMoment;

export class Notice {
	constructor(public message?: string) {}
}