import { HttpError } from "../api";

/** A place lookup failed in a way the user can be told about. Route handlers answer it like any HttpError. */
export class PlacesError extends HttpError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "PlacesError";
  }
}
