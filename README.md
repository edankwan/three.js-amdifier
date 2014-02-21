##three.js amdifier
It is a simple tool specifically to amd modulize three.js. Basically it is just a tool for the website I am working on so there wont be any unit testing and stuff like that.

###Concept
Three.js attaches all of the modules variables into the "THREE" variable and all modules are created using the same prototype style. It makes the modulization way easier.

First of all, I need to create a list mapping list. I load all of the source js files as text and analyze the codes.

I assume these kind of pattern as defined module. 
 
	THREE.Foo =   

And these kind of pattern but not the pattern above as required module (***All depenedencies***)

	THREE.Foo

Then I can have a very simple list of all dependencies. But there is a big problem - **Circular Dependency**. If you look at `src/math/Euler` and `src/math/Quaternion`, they both depends on each other. **BUT**, in the `src/math/Quaternion`, it doesn't require the `Euler` right after the javascript file is loaded. Which means we shouldn't add `Euler` as the dependency in `Quaternion`(We should but it is how Three.js coded) and add the dependency in out of this library because requirejs can handle that correctly. So... how to determinate if the modules are required immediately or not? I found a tricky way... and here is the codes of the idea:

	var SHADOW_THREE = {};
	
	var _usedProperties = [];

	function _hijackTHREEProperty(property, ref) {
	    _usedProperties.push(property);
	    return ref;
	}
	
	function _loadBuiltTHREE() {
	    var _THREE;

		// load the Three.js and put store the result to _THREE variable
	    eval(_fs.readFileSync('Three.min.js', 'utf8') + ';_THREE=THREE;');

		// Create a shadow three variable with getter/setter, 
	    for(var property in _THREE) {
	        var ref = _THREE[property];
			//if the property was access, add it to the _usedProperties list
	        SHADOW_THREE.__defineGetter__(property, _bind(_hijackTHREEProperty, SHADOW_THREE, property, ref));
	        SHADOW_THREE.__defineSetter__(property, function(){});
	    }
	}

	function _getUsedPropertiesInCamera() {
		var THREE = SHADOW_THREE;
		_usedProperties = [];
		
		//eval the Camera.js script
        eval(_fs.readFileSync('Camera.js', 'utf8'));
		return _usedProperties;
	}

Then you know what properties were really accessed immediately, these properties are the real dependencies. After that, we can loop through the ***All depenedencies*** and add the dependencies as much as possible as long as there is no conflict/circular dependencies.

The codes are messy and no guaranty for anything.

###Usage
1. Run `npm install`
2. Put the Three.min.js into the `built_three_src` folder
3. Put the src of `Three.js` into the `src` folder
4. Run `node amdifier.js`
5. Move the amd three.js source codes from `dist` into your project.
5. Load the module you needed in your app. If there are missing modules, check file link in the error console in the browser dev tool, found out which modules are missing, and add it into you app. 
 
See the `report.html`. If there is any **Missing dependencies**. In r66, only the `REVISION` is missing because they don't use the pattern above to define but it doesn't matter. If you found other missing dependencies, this tool probably doesn't work due to the pattern changes.

###TODO

- Codes clean up
- Replace variable names and not exposing everything in the 'THREE'.
- Put `Scene`, `WebGLRenderer`, `Perspective Camera` and other commonly used modules to higher priority in dependencies lookUp. Right now, I add it randomly and it might not been ideal for the file size.


###Credit
**Comment removal** - http://james.padolsey.com/javascript/removing-comments-in-javascript/