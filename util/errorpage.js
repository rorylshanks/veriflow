import ejs from 'ejs';
import path from 'path';
import { getConfig, getRedirectBasepath } from '../util/config.js';


async function renderErrorPage(status_code, error_code_override, req) {
    var config = getConfig();
    var redirectBasePath = getRedirectBasepath()
    var logoutUrlObj = new URL(`${config.service_url}${redirectBasePath}/logout`)
    var logout_url = logoutUrlObj.href
    var header = "Internal Server Error"


    // UI Tweaks for error page
    var footer_text = config?.ui?.error_page_footer_text || "Veriflow Access Proxy"
    var background_image_url = config?.ui?.error_page_background || false
    var additional_css = config?.ui?.error_page_additional_css || false
    var show_error_code = true
    if (config?.ui?.error_page_show_error_code != null){
        var show_error_code = config?.ui?.error_page_show_error_code
    }
    var logo_image_src = config?.ui?.logo_image_src || false
    var page_title = config?.ui?.page_title || "Veriflow"

    var description = "An internal server error occurred. Please try again."
    var error_code = "ERR_INTERNAL_ERROR"
    if (status_code == 404) {
        header = "Page Not Found"
        description = "The requested page cannot be found. Please check and try again."
        error_code = "ERR_NOT_FOUND"
    }
    if (status_code == 403) {
        header = "Forbidden"
        description = "You do not have permission to access the requested resource."
        error_code = "ERR_ACCESS_DENIED"
    }
    if (status_code == 503) {
        header = "Service Unavailable"
        description = "The requested resource is currently not available. Please try again later"
        error_code = "ERR_NOT_AVAIL"
    }
    if (error_code_override) {
        error_code = error_code_override
    }

    if (error_code == "LOGOUT_SUCCESS") {
        header = "Logged Out"
        description = "You have been successfully logged out of Veriflow."
    }

    var title = `${status_code} ${header} | ${page_title}`
    var html = await ejs.renderFile(path.join(process.cwd(), '/views/error_fullpage.ejs'), 
    {
        title,
        header,
        status_code,
        description,
        error_code,
        footer_text,
        user: req?.session?.userId,
        logout_url: logout_url,
        background_image_url: background_image_url,
        additional_css: additional_css,
        show_error_code: show_error_code,
        logo_image_src: logo_image_src,
        request_id: req?.headers["X-Veriflow-Request-Id"] || "{http.request.uuid}",
        request_host: req?.get("X-Forwarded-Host") || "{http.request.host}"
    });
    return html
}


export default {
    renderErrorPage
}
