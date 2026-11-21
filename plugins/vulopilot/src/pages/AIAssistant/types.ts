/** Which issue the Issues section should open on: set by the rail, a deep link (`&scanner_id=`) or Pro's slot. */
export interface IssuesFilter {
	scannerId: string;
	label: string;
	category: string;
}
