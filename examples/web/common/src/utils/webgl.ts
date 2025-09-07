/**
 * WebGL Renderer for efficient video processing and rendering
 */
export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private positionBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;
  private positionLocation: number;
  private texCoordLocation: number;
  private imageLocation: WebGLUniformLocation;
  private maskLocation: WebGLUniformLocation;
  private videoTexture: WebGLTexture | null = null;
  private lastVideoWidth = 0;
  private lastVideoHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;

    // Create shader program
    this.program = this.createShaderProgram();
    
    // Get attribute and uniform locations
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
    this.imageLocation = gl.getUniformLocation(this.program, 'u_image')!;
    this.maskLocation = gl.getUniformLocation(this.program, 'u_mask')!;

    // Create buffers
    this.positionBuffer = this.createPositionBuffer();
    this.texCoordBuffer = this.createTexCoordBuffer();
  }

  private createShaderProgram(): WebGLProgram {
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fragmentShaderSource = `
      precision highp float;
      uniform sampler2D u_image;
      uniform sampler2D u_mask;
      varying vec2 v_texCoord;
      
      // High-quality Gaussian blur function with optimized sampling
      vec4 getBlurredColor(sampler2D tex, vec2 coord) {
        vec2 texelSize = vec2(1.0) / vec2(textureSize(tex, 0));
        vec4 color = vec4(0.0);
        
        // 13-tap optimized Gaussian blur kernel for higher quality
        float weights[13];
        weights[0] = 0.0044; weights[1] = 0.0175; weights[2] = 0.0540;
        weights[3] = 0.1295; weights[4] = 0.2420; weights[5] = 0.3521;
        weights[6] = 0.3989; weights[7] = 0.3521; weights[8] = 0.2420;
        weights[9] = 0.1295; weights[10] = 0.0540; weights[11] = 0.0175;
        weights[12] = 0.0044;
        
        // Horizontal blur with sub-pixel sampling
        for (int i = 0; i < 13; i++) {
          float offset = float(i - 6) * 1.5; // Increased sampling radius
          vec2 sampleCoord = coord + vec2(offset * texelSize.x, 0.0);
          color += texture2D(tex, sampleCoord) * weights[i];
        }
        
        return color;
      }
      
      vec4 getDoubleBlurredColor(sampler2D tex, vec2 coord) {
        vec2 texelSize = vec2(1.0) / vec2(textureSize(tex, 0));
        vec4 color = vec4(0.0);
        
        // 13-tap optimized Gaussian blur kernel
        float weights[13];
        weights[0] = 0.0044; weights[1] = 0.0175; weights[2] = 0.0540;
        weights[3] = 0.1295; weights[4] = 0.2420; weights[5] = 0.3521;
        weights[6] = 0.3989; weights[7] = 0.3521; weights[8] = 0.2420;
        weights[9] = 0.1295; weights[10] = 0.0540; weights[11] = 0.0175;
        weights[12] = 0.0044;
        
        // Vertical blur with sub-pixel sampling
        for (int i = 0; i < 13; i++) {
          float offset = float(i - 6) * 1.5;
          vec2 sampleCoord = coord + vec2(0.0, offset * texelSize.y);
          color += getBlurredColor(tex, sampleCoord) * weights[i];
        }
        
        return color;
      }
      
      // Advanced edge detection and smoothing
      float getHighQualityMask(vec2 coord) {
        vec2 texelSize = vec2(1.0) / vec2(textureSize(u_mask, 0));
        
        // Multi-sample edge detection with rotated grid
        float samples = 0.0;
        float sampleCount = 0.0;
        
        // Primary sample
        float center = texture2D(u_mask, coord).r;
        samples += center;
        sampleCount += 1.0;
        
        // 8-direction sampling with sub-pixel offsets
        vec2 offsets[8];
        offsets[0] = vec2(-1.0, -1.0); offsets[1] = vec2( 0.0, -1.0);
        offsets[2] = vec2( 1.0, -1.0); offsets[3] = vec2( 1.0,  0.0);
        offsets[4] = vec2( 1.0,  1.0); offsets[5] = vec2( 0.0,  1.0);
        offsets[6] = vec2(-1.0,  1.0); offsets[7] = vec2(-1.0,  0.0);
        
        float weights[8];
        weights[0] = 0.7071; weights[1] = 1.0; weights[2] = 0.7071; weights[3] = 1.0;
        weights[4] = 0.7071; weights[5] = 1.0; weights[6] = 0.7071; weights[7] = 1.0;
        
        for (int i = 0; i < 8; i++) {
          vec2 sampleCoord = coord + offsets[i] * texelSize * 0.5;
          float sample = texture2D(u_mask, sampleCoord).r;
          samples += sample * weights[i];
          sampleCount += weights[i];
        }
        
        // Additional sub-pixel sampling for critical edge areas
        float variance = 0.0;
        float avgSample = samples / sampleCount;
        
        for (int i = 0; i < 8; i++) {
          vec2 sampleCoord = coord + offsets[i] * texelSize * 0.5;
          float sample = texture2D(u_mask, sampleCoord).r;
          float diff = sample - avgSample;
          variance += diff * diff * weights[i];
        }
        variance /= sampleCount;
        
        // Enhanced sampling for high-variance (edge) regions
        if (variance > 0.02) {
          // Rotated grid sampling for better edge coverage
          vec2 rotatedOffsets[4];
          rotatedOffsets[0] = vec2(-0.5, -0.5); rotatedOffsets[1] = vec2( 0.5, -0.5);
          rotatedOffsets[2] = vec2( 0.5,  0.5); rotatedOffsets[3] = vec2(-0.5,  0.5);
          
          for (int i = 0; i < 4; i++) {
            vec2 sampleCoord = coord + rotatedOffsets[i] * texelSize * 0.25;
            float sample = texture2D(u_mask, sampleCoord).r;
            samples += sample * 0.5;
            sampleCount += 0.5;
          }
        }
        
        return samples / sampleCount;
      }
      
      // Multi-level smoothstep for ultra-smooth edges
      float applySuperSmoothstep(float x) {
        // Triple smoothstep for maximum smoothness
        float s1 = smoothstep(0.0, 1.0, x);
        float s2 = smoothstep(0.0, 1.0, s1);
        float s3 = smoothstep(0.0, 1.0, s2);
        
        // Blend for optimal balance between smoothness and precision
        return mix(mix(s1, s2, 0.6), s3, 0.4);
      }
      
      void main() {
        // High-quality mask sampling with edge detection
        float rawMask = getHighQualityMask(v_texCoord);
        
        // Apply ultra-high-quality edge smoothing
        float alpha = applySuperSmoothstep(rawMask);
        
        // Additional gradient-based refinement
        vec2 texelSize = vec2(1.0) / vec2(textureSize(u_mask, 0));
        
        // Compute local gradient for adaptive processing
        float dx = getHighQualityMask(v_texCoord + vec2(texelSize.x, 0.0)) - 
                   getHighQualityMask(v_texCoord - vec2(texelSize.x, 0.0));
        float dy = getHighQualityMask(v_texCoord + vec2(0.0, texelSize.y)) - 
                   getHighQualityMask(v_texCoord - vec2(0.0, texelSize.y));
        
        float gradient = length(vec2(dx, dy));
        
        // Edge-aware alpha refinement
        if (gradient > 0.1) {
          // High-gradient areas get extra smoothing
          float edgeMask = 1.0 - exp(-gradient * 10.0);
          float smoothAlpha = applySuperSmoothstep(
            applySuperSmoothstep(rawMask)
          );
          alpha = mix(alpha, smoothAlpha, edgeMask * 0.7);
        }
        
        // Final micro-adjustment for pixel-perfect edges
        alpha = mix(alpha, applySuperSmoothstep(alpha), 0.3);
        
        // Get sharp and blurred versions of the image
        vec4 sharpImage = texture2D(u_image, v_texCoord);
        vec4 blurredImage = getDoubleBlurredColor(u_image, v_texCoord);
        
        // Ultra-smooth blending with gamma correction for better perceived smoothness
        float gammaAlpha = pow(alpha, 0.8); // Slight gamma adjustment
        vec4 finalColor = mix(blurredImage, sharpImage, gammaAlpha);
        
        // Keep original image colors with ultra-smooth mask edges
        gl_FragColor = vec4(finalColor.rgb, 1.0);
      }
    `;

    // Create shaders
    const vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER)!;
    this.gl.shaderSource(vertexShader, vertexShaderSource);
    this.gl.compileShader(vertexShader);

    const fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    this.gl.shaderSource(fragmentShader, fragmentShaderSource);
    this.gl.compileShader(fragmentShader);

    // Create program
    const program = this.gl.createProgram()!;
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error('Failed to link shader program: ' + this.gl.getProgramInfoLog(program));
    }

    return program;
  }

  private createPositionBuffer(): WebGLBuffer {
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);

    const buffer = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
    return buffer;
  }

  private createTexCoordBuffer(): WebGLBuffer {
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0,
    ]);

    const buffer = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
    return buffer;
  }

  public render(videoElement: HTMLVideoElement, maskTexture: WebGLTexture): void {
    const gl = this.gl;

    // Get current video dimensions
    const currentWidth = videoElement.videoWidth;
    const currentHeight = videoElement.videoHeight;

    // Create or update video texture if dimensions changed
    if (this.lastVideoWidth !== currentWidth || this.lastVideoHeight !== currentHeight) {
      this.createVideoTexture();
      this.lastVideoWidth = currentWidth;
      this.lastVideoHeight = currentHeight;
    }

    // Update video texture with current frame
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);

    // Set up WebGL rendering to fit the canvas
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Set up position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Set up texture coordinate buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.texCoordLocation);
    gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Bind textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.uniform1i(this.imageLocation, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.uniform1i(this.maskLocation, 1);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private createVideoTexture(): void {
    const gl = this.gl;

    // Delete old video texture if it exists
    if (this.videoTexture) {
      gl.deleteTexture(this.videoTexture);
    }

    // Create new video texture
    this.videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  public getContext(): WebGL2RenderingContext {
    return this.gl;
  }
}

/**
 * Create a fallback mask texture (white texture that shows everything)
 */
export const createFallbackMaskTexture = (gl: WebGL2RenderingContext): WebGLTexture => {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  
  // Create a 1x1 white pixel
  const pixel = new Uint8Array([255, 255, 255, 255]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  
  return texture;
};