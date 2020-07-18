export default class Keys {

	up = false;
	right = false;
	down = false;
	left = false;

	constructor () {
		document.onkeydown = (e) => {switch(e.key.toLowerCase()){
			case "w": this.up = true; break;
			case "d": this.right = true; break;
			case "s": this.down = true; break;
			case "a": this.left = true; break;
		}};
		document.onkeyup = (e) => {switch(e.key.toLowerCase()){
			case "w": this.up = false; break;
			case "d": this.right = false; break;
			case "s": this.down = false; break;
			case "a": this.left = false; break;
		}};
	}

}